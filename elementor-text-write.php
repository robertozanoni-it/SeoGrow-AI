<?php
if (!defined('ABSPATH')) { exit; }

// Deliberately narrow: opt-in Canvas pages; static heading/text widgets only.
// Database protection and frontend rendering are separate outcomes.
function seogrow_elementor_text_error($code, $message, $status = 409) {
    return new WP_Error($code, $message, array('status' => $status));
}
function seogrow_elementor_text_canonical($value) {
    if (is_object($value)) {
        $properties = get_object_vars($value);
        ksort($properties);
        foreach ($properties as $key => $item) { $properties[$key] = seogrow_elementor_text_canonical($item); }
        return (object) $properties;
    }
    if (is_array($value)) { return array_map('seogrow_elementor_text_canonical', $value); }
    return $value;
}
function seogrow_elementor_text_same($left, $right) {
    return wp_json_encode(seogrow_elementor_text_canonical($left)) === wp_json_encode(seogrow_elementor_text_canonical($right));
}
function seogrow_elementor_text_tree($nodes, &$ids, &$count, $depth = 0) {
    if (!is_array($nodes) || $depth > 20) { return false; }
    foreach ($nodes as $node) {
        if (!is_object($node) || ++$count > 200 || empty($node->id) || !is_string($node->id) || isset($ids[$node->id]) || !isset($node->settings) || !is_object($node->settings)) { return false; }
        $ids[$node->id] = true;
        $type = isset($node->elType) ? $node->elType : '';
        if ($type === 'container') {
            if (isset($node->widgetType) || !isset($node->elements) || !seogrow_elementor_text_tree($node->elements, $ids, $count, $depth + 1)) { return false; }
        } elseif ($type === 'widget') {
            if (!isset($node->widgetType) || !in_array($node->widgetType, array('heading', 'text-editor'), true) || !empty($node->elements)) { return false; }
        } else { return false; }
        // No executable/dynamic content or embedded documents in this adapter.
        if (preg_match('/"(?:__dynamic__|template_id|shortcode|custom_css|html)"\s*:|\[elementor-template|\$\$type/i', wp_json_encode($node->settings))) { return false; }
    }
    return true;
}
function seogrow_elementor_text_diff($before, $after, &$changed) {
    if (count($before) !== count($after)) { return false; }
    foreach ($before as $index => $old) {
        $new = $after[$index];
        $old_copy = clone $old; $new_copy = clone $new;
        if ($old->elType === 'container') {
            if (!isset($new->elements) || !seogrow_elementor_text_diff($old->elements, $new->elements, $changed)) { return false; }
            unset($old_copy->elements, $new_copy->elements);
        } else {
            $field = $old->widgetType === 'heading' ? 'title' : 'editor';
            if (!isset($old->settings->$field, $new->settings->$field) || !is_string($old->settings->$field) || !is_string($new->settings->$field)) { return false; }
            // Validate existing text too: saving regenerates every widget's HTML.
            $allowed = $field === 'title' ? array() : array('p'=>array(), 'br'=>array(), 'strong'=>array(), 'em'=>array(), 'ul'=>array(), 'ol'=>array(), 'li'=>array());
            foreach (array($old->settings->$field, $new->settings->$field) as $text) {
                if (strlen($text) > 20000 || preg_match('/[\[\]]/', $text) || wp_kses($text, $allowed) !== $text) { return false; }
            }
            $target = $new->settings->$field;
            if ($target !== $old->settings->$field) {
                if (!trim($target) || strlen($target) > 20000 || preg_match('/[\[\]]/', $target)) { return false; }
                $allowed = $field === 'title' ? array() : array('p'=>array(), 'br'=>array(), 'strong'=>array(), 'em'=>array(), 'ul'=>array(), 'ol'=>array(), 'li'=>array());
                if (wp_kses($target, $allowed) !== $target) { return false; }
                $changed++;
            }
            $old_copy->settings = clone $old->settings; $new_copy->settings = clone $new->settings;
            unset($old_copy->settings->$field, $new_copy->settings->$field);
        }
        if (!seogrow_elementor_text_same($old_copy, $new_copy)) { return false; }
    }
    return true;
}
function seogrow_elementor_text_validate($expected, $changes) {
    if (!is_array($expected) || !is_array($changes)) { return false; }
    if (array_keys($expected) !== array('meta') || array_keys($changes) !== array('meta') || !is_array($expected['meta']) || !is_array($changes['meta']) || array_keys($expected['meta']) !== array('_elementor_data') || array_keys($changes['meta']) !== array('_elementor_data')) { return false; }
    $before = $expected['meta']['_elementor_data']; $after = $changes['meta']['_elementor_data'];
    if (!is_string($before) || !is_string($after) || strlen($before) > 262144 || strlen($after) > 262144) { return false; }
    $old = json_decode($before); $new = json_decode($after);
    $ids = array(); $count = 0;
    if (!is_array($old) || !count($old) || !seogrow_elementor_text_tree($old, $ids, $count)) { return false; }
    $ids = array(); $count = 0; $changed = 0;
    if (!is_array($new) || !seogrow_elementor_text_tree($new, $ids, $count) || !seogrow_elementor_text_diff($old, $new, $changed)) { return false; }
    return $new;
}
function seogrow_elementor_text_meta($rows, $key) {
    $matches = array_values(array_filter($rows, static function ($row) use ($key) { return $row['meta_key'] === $key; }));
    return count($matches) === 1 ? $matches[0] : null;
}
function seogrow_elementor_text_clear_local_cache($id) {
    clean_post_cache($id);
    wp_cache_delete($id, 'post_meta');
    if (class_exists('Elementor\\Core\\Files\\CSS\\Post')) { \Elementor\Core\Files\CSS\Post::create($id)->delete(); }
}
function seogrow_connector_elementor_text_write($request) {
    global $wpdb;
    $id = (int) $request->get_param('id');
    $expected = $request->get_param('expectedCurrent'); $changes = $request->get_param('changes');
    $elements = seogrow_elementor_text_validate($expected, $changes);
    if ($request->get_param('resource') !== 'pages' || $elements === false || !class_exists('Elementor\\Plugin') || !current_user_can('edit_post', $id)) { return seogrow_connector_atomic_unavailable(); }
    // A per-page opt-in is necessary for initial rollout. Never enable all pages.
    // It is checked again from locked database rows, not from object cache.
    foreach (array($wpdb->posts, $wpdb->postmeta) as $table) {
        $engine = $wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s', $table));
        if (strtoupper((string) $engine) !== 'INNODB') { return seogrow_connector_atomic_unavailable(); }
    }
    // SET TRANSACTION fails inside an existing transaction; never implicitly commit another caller's work.
    if ((string) $wpdb->get_var('SELECT @@session.autocommit') !== '1' || $wpdb->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') === false) { return seogrow_connector_atomic_unavailable(); }
    if ($wpdb->query('START TRANSACTION') === false) { return seogrow_connector_atomic_unavailable(); }
    $saving = false; $committed = false;
    try {
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id), ARRAY_A);
        // Lock all rows AND the post_id range: a concurrent duplicate metadata insert must also wait.
        $rows = $wpdb->get_results($wpdb->prepare("SELECT meta_id, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d FOR UPDATE", $id), ARRAY_A);
        if (!$row || $row['post_type'] !== 'page' || !in_array($row['post_status'], array('draft', 'publish', 'private'), true) || !is_array($rows)) { throw new RuntimeException('unsupported'); }
        foreach (array('_wp_page_template'=>'elementor_canvas', '_elementor_edit_mode'=>'builder', '_elementor_template_type'=>'wp-page', '_seogrow_elementor_text_enabled'=>'1') as $key => $value) {
            $meta = seogrow_elementor_text_meta($rows, $key);
            if (!$meta || $meta['meta_value'] !== $value) { throw new RuntimeException('unsupported'); }
        }
        $data = seogrow_elementor_text_meta($rows, '_elementor_data');
        if (!$data) { throw new RuntimeException('unsupported'); }
        if ($data['meta_value'] !== $expected['meta']['_elementor_data']) { throw new RuntimeException('stale'); }
        if ($wpdb->query('SAVEPOINT seogrow_elementor_text') === false) { throw new RuntimeException('unsupported'); }
        seogrow_elementor_text_clear_local_cache($id);
        $document = \Elementor\Plugin::$instance->documents->get($id, false);
        if (!$document || $document->get_main_id() !== $id || $document->get_name() !== 'wp-page' || !$document->is_editable_by_current_user()) { throw new RuntimeException('unsupported'); }
        $saving = true;
        // Avoid our legacy all-site purge. Document::save invalidates this document's caches itself.
        $GLOBALS['seogrow_elementor_text_saving_id'] = $id;
        try { $saved = $document->save(array('elements' => json_decode(wp_json_encode($elements), true))); }
        finally { unset($GLOBALS['seogrow_elementor_text_saving_id']); }
        if ($saved !== true) { throw new RuntimeException('save_failed'); }
        $after_rows = $wpdb->get_results($wpdb->prepare("SELECT meta_id, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d FOR UPDATE", $id), ARRAY_A);
        if (!is_array($after_rows)) { throw new RuntimeException('reread_failed'); }
        foreach (array('_wp_page_template', '_elementor_edit_mode', '_elementor_template_type', '_seogrow_elementor_text_enabled') as $key) {
            $original_meta = seogrow_elementor_text_meta($rows, $key);
            $after_meta = seogrow_elementor_text_meta($after_rows, $key);
            if (!$after_meta || $after_meta['meta_value'] !== $original_meta['meta_value']) { throw new RuntimeException('scope_changed'); }
        }
        $after_row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id), ARRAY_A);
        if (!$after_row) { throw new RuntimeException('reread_failed'); }
        foreach ($row as $key => $value) {
            // Native Elementor regenerates content and updates modification timestamps.
            if (!in_array($key, array('post_content', 'post_modified', 'post_modified_gmt'), true) && $after_row[$key] !== $value) { throw new RuntimeException('core_changed'); }
        }
        $saved_data = seogrow_elementor_text_meta($after_rows, '_elementor_data');
        if (!$saved_data || !seogrow_elementor_text_same(json_decode($saved_data['meta_value']), $elements)) { throw new RuntimeException('normalized_differently'); }
        // Native save may normalize JSON escaping/order. Only after semantic equality,
        // retain the exact approved representation so rollback snapshots stay byte-exact.
        if ($wpdb->query($wpdb->prepare("UPDATE {$wpdb->postmeta} SET meta_value = %s WHERE meta_id = %d AND BINARY meta_value = BINARY %s", $changes['meta']['_elementor_data'], (int) $saved_data['meta_id'], $saved_data['meta_value'])) === false) { throw new RuntimeException('db_failure'); }
        $final = $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_id = %d", (int) $saved_data['meta_id']));
        if ($final !== $changes['meta']['_elementor_data']) { throw new RuntimeException('db_failure'); }
        // If any native hook committed/rolled back, the savepoint is gone. Never claim atomic success.
        if ($wpdb->query('RELEASE SAVEPOINT seogrow_elementor_text') === false) { throw new RuntimeException('transaction_lost'); }
        if ($wpdb->query('COMMIT') === false) { throw new RuntimeException('commit_unverified'); }
        $committed = true;
        seogrow_elementor_text_clear_local_cache($id);
        $observed = $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_id = %d", (int) $saved_data['meta_id']));
        if ($observed !== $changes['meta']['_elementor_data']) { throw new RuntimeException('post_commit_conflict'); }
        $entity = seogrow_connector_atomic_entity($after_row, $id);
        $entity['meta'] = array('_elementor_data' => $observed);
        return array('ok'=>true, 'atomicGuaranteed'=>true, 'staleChecked'=>true, 'operation'=>$request->get_param('operation'), 'resource'=>'pages', 'entity'=>$entity, 'renderingVerified'=>false, 'requiresFrontendVerification'=>true, 'scope'=>'elementor-canvas-static-text-v1');
    } catch (Throwable $error) {
        if (!$committed) { $wpdb->query('ROLLBACK'); }
        try { seogrow_elementor_text_clear_local_cache($id); } catch (Throwable $ignored) { /* Preserve the uncertain outcome. */ }
        if ($saving || $committed) { return seogrow_elementor_text_error('ATOMIC_RESULT_UNVERIFIED', 'Salvataggio Elementor non confermato. Rileggi il documento prima di riprovare; nessun ripristino automatico alla cieca.'); }
        if ($error->getMessage() === 'stale') { return seogrow_elementor_text_error('STALE_CONFLICT', 'Il documento Elementor è cambiato dopo l’anteprima. Nessuna modifica applicata.'); }
        return seogrow_connector_atomic_unavailable();
    } finally { unset($GLOBALS['seogrow_elementor_text_saving_id']); }
}
