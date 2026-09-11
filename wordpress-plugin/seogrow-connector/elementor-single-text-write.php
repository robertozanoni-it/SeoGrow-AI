<?php
if (!defined('ABSPATH')) { exit; }

function seogrow_elementor_single_text_error($code, $message, $status = 409) {
    return new WP_Error($code, $message, array('status' => $status));
}

function seogrow_elementor_single_text_meta_row($rows, $key) {
    $matches = array_values(array_filter($rows, static function ($row) use ($key) {
        return isset($row['meta_key']) && (string) $row['meta_key'] === $key;
    }));
    return count($matches) === 1 ? $matches[0] : null;
}

function seogrow_elementor_single_text_compare($before, $after, &$changed, &$widget_id, $depth = 0, &$nodes = 0, $context = array()) {
    if ($depth > 90 || ++$nodes > 12000) { return false; }

    if (is_object($before) || is_object($after)) {
        if (!is_object($before) || !is_object($after)) { return false; }
        $before_vars = get_object_vars($before);
        $after_vars = get_object_vars($after);
        if (array_keys($before_vars) !== array_keys($after_vars)) { return false; }

        $next_context = $context;
        if (isset($before_vars['widgetType']) || isset($after_vars['widgetType'])) {
            if (!isset($before_vars['widgetType'], $after_vars['widgetType']) || $before_vars['widgetType'] !== $after_vars['widgetType']) { return false; }
            $next_context['widgetType'] = (string) $before_vars['widgetType'];
            $next_context['widgetId'] = isset($before_vars['id']) ? (string) $before_vars['id'] : '';
        }

        foreach ($before_vars as $key => $value) {
            $child_context = $next_context;
            if ($key === 'settings') { $child_context['insideSettings'] = true; }
            if ($key === 'editor') { $child_context['field'] = 'editor'; }
            if (!seogrow_elementor_single_text_compare($value, $after_vars[$key], $changed, $widget_id, $depth + 1, $nodes, $child_context)) { return false; }
        }
        return true;
    }

    if (is_array($before) || is_array($after)) {
        if (!is_array($before) || !is_array($after) || count($before) !== count($after) || array_keys($before) !== array_keys($after)) { return false; }
        foreach ($before as $key => $value) {
            if (!seogrow_elementor_single_text_compare($value, $after[$key], $changed, $widget_id, $depth + 1, $nodes, $context)) { return false; }
        }
        return true;
    }

    if ($before === $after) { return true; }
    if (!is_string($before) || !is_string($after) || $changed !== 0) { return false; }
    if (($context['widgetType'] ?? '') !== 'text-editor' || empty($context['insideSettings']) || ($context['field'] ?? '') !== 'editor') { return false; }
    if (strlen($before) > 120000 || strlen($after) > 120000 || trim($after) === '') { return false; }
    if (function_exists('wp_kses_post') && wp_kses_post($after) !== $after) { return false; }
    $changed = 1;
    $widget_id = (string) ($context['widgetId'] ?? '');
    return $widget_id !== '';
}

function seogrow_elementor_single_text_validate(WP_REST_Request $request) {
    $operation = (string) $request->get_param('operation');
    $resource = (string) $request->get_param('resource');
    $expected = $request->get_param('expectedCurrent');
    $changes = $request->get_param('changes');
    if (!in_array($operation, array('apply', 'rollback'), true) || !in_array($resource, array('posts', 'pages'), true)) { return false; }
    if (!is_array($expected) || !is_array($changes) || array_keys($expected) !== array('meta') || array_keys($changes) !== array('meta')) { return false; }
    if (!is_array($expected['meta']) || !is_array($changes['meta']) || array_keys($expected['meta']) !== array('_elementor_data') || array_keys($changes['meta']) !== array('_elementor_data')) { return false; }

    $before_raw = $expected['meta']['_elementor_data'];
    $after_raw = $changes['meta']['_elementor_data'];
    if (!is_string($before_raw) || !is_string($after_raw) || strlen($before_raw) > 524288 || strlen($after_raw) > 524288 || $before_raw === $after_raw) { return false; }
    $before = json_decode($before_raw);
    $after = json_decode($after_raw);
    if (!is_array($before) || !is_array($after)) { return false; }

    $changed = 0; $widget_id = ''; $nodes = 0;
    if (!seogrow_elementor_single_text_compare($before, $after, $changed, $widget_id, 0, $nodes) || $changed !== 1 || $widget_id === '') { return false; }
    return array('widgetId' => $widget_id);
}

function seogrow_connector_elementor_single_text_write(WP_REST_Request $request) {
    global $wpdb;
    $validated = seogrow_elementor_single_text_validate($request);
    if ($validated === false) { return null; }

    $id = (int) $request->get_param('id');
    $resource = (string) $request->get_param('resource');
    $expected = $request->get_param('expectedCurrent');
    $changes = $request->get_param('changes');
    $post_type = $resource === 'posts' ? 'post' : 'page';
    $elementor_type = $resource === 'posts' ? 'wp-post' : 'wp-page';

    if ($id <= 0 || !class_exists('Elementor\\Plugin') || !current_user_can('edit_post', $id)) {
        return seogrow_elementor_single_text_error('ATOMIC_WRITE_FORBIDDEN', 'Identità o permessi WordPress non validi.', 403);
    }

    foreach (array($wpdb->posts, $wpdb->postmeta) as $table) {
        $engine = $wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s', $table));
        if (strtoupper((string) $engine) !== 'INNODB') { return seogrow_connector_atomic_unavailable(); }
    }
    if ((string) $wpdb->get_var('SELECT @@session.autocommit') !== '1' || $wpdb->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') === false || $wpdb->query('START TRANSACTION') === false) {
        return seogrow_connector_atomic_unavailable();
    }

    $committed = false;
    try {
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id), ARRAY_A);
        $rows = $wpdb->get_results($wpdb->prepare("SELECT meta_id, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d FOR UPDATE", $id), ARRAY_A);
        if (!$row || $row['post_type'] !== $post_type || !in_array($row['post_status'], array('draft', 'publish', 'private'), true) || !is_array($rows)) { throw new RuntimeException('unsupported'); }

        $edit_mode = seogrow_elementor_single_text_meta_row($rows, '_elementor_edit_mode');
        $template_type = seogrow_elementor_single_text_meta_row($rows, '_elementor_template_type');
        $data = seogrow_elementor_single_text_meta_row($rows, '_elementor_data');
        if (!$edit_mode || $edit_mode['meta_value'] !== 'builder' || !$template_type || $template_type['meta_value'] !== $elementor_type || !$data) { throw new RuntimeException('unsupported'); }
        if ((string) $data['meta_value'] !== (string) $expected['meta']['_elementor_data']) { throw new RuntimeException('stale'); }

        $affected = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->postmeta} SET meta_value = %s WHERE meta_id = %d AND post_id = %d AND meta_key = '_elementor_data' AND BINARY meta_value = BINARY %s",
            (string) $changes['meta']['_elementor_data'],
            (int) $data['meta_id'],
            $id,
            (string) $expected['meta']['_elementor_data']
        ));
        if ($affected === false || (int) $affected !== 1) { throw new RuntimeException('stale'); }

        $locked_after = $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_id = %d FOR UPDATE", (int) $data['meta_id']));
        if (!is_string($locked_after) || $locked_after !== (string) $changes['meta']['_elementor_data']) { throw new RuntimeException('result'); }
        if ($wpdb->query('COMMIT') === false) { throw new RuntimeException('commit'); }
        $committed = true;

        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
        if (function_exists('seogrow_elementor_text_clear_local_cache')) { seogrow_elementor_text_clear_local_cache($id); }
        if (function_exists('seogrow_connector_clear_elementor_cache')) { seogrow_connector_clear_elementor_cache((int) $data['meta_id'], $id, '_elementor_data'); }

        $observed = $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_id = %d", (int) $data['meta_id']));
        if (!is_string($observed) || $observed !== (string) $changes['meta']['_elementor_data']) {
            return seogrow_elementor_single_text_error('ATOMIC_RESULT_UNVERIFIED', 'Il blocco Elementor è stato scritto ma il valore finale non è stato confermato. Riverifica prima di continuare.');
        }
        $post_after = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id), ARRAY_A);
        if (!$post_after || $post_after['post_type'] !== $post_type) {
            return seogrow_elementor_single_text_error('ATOMIC_RESULT_UNVERIFIED', 'Identità finale della risorsa Elementor non confermata.');
        }
        $entity = seogrow_connector_atomic_entity($post_after, $id);
        $entity['meta'] = array('_elementor_data' => $observed);
        return array(
            'ok' => true,
            'atomicGuaranteed' => true,
            'staleChecked' => true,
            'operation' => (string) $request->get_param('operation'),
            'resource' => $resource,
            'entity' => $entity,
            'scope' => 'elementor-single-text-editor-cas-v1',
            'widgetId' => $validated['widgetId'],
            'requiresFrontendVerification' => true,
        );
    } catch (Throwable $error) {
        if (!$committed) { $wpdb->query('ROLLBACK'); }
        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
        if ($error->getMessage() === 'stale') {
            return seogrow_elementor_single_text_error('STALE_CONFLICT', 'Il documento Elementor è cambiato dopo l’anteprima. Nessuna modifica applicata.');
        }
        return seogrow_connector_atomic_unavailable();
    }
}

function seogrow_connector_elementor_single_text_pre_dispatch($result, $server, $request) {
    if ($result !== null || !($request instanceof WP_REST_Request) || $request->get_route() !== '/seogrow/v1/atomic-write') { return $result; }
    $handled = seogrow_connector_elementor_single_text_write($request);
    return $handled === null ? $result : rest_ensure_response($handled);
}
add_filter('rest_pre_dispatch', 'seogrow_connector_elementor_single_text_pre_dispatch', 15, 3);
