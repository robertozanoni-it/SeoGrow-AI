<?php
if (!defined('ABSPATH')) { exit; }

function seogrow_shared_link_error($code, $message, $status = 409) {
    return new WP_Error($code, $message, array('status' => $status));
}

function seogrow_shared_link_allowed_types() {
    return array('header', 'footer', 'single', 'archive', 'popup', 'widget');
}

function seogrow_shared_link_mode($value) {
    return (string) $value === 'delete-anchor-text' ? 'delete-anchor-text' : 'unlink-preserve-text';
}

function seogrow_shared_link_target($value) {
    $url = esc_url_raw((string) $value);
    $parts = wp_parse_url($url);
    $home = wp_parse_url(home_url('/'));
    if (!$url || !is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) { return ''; }
    if (!in_array(strtolower((string) $parts['scheme']), array('http', 'https'), true)) { return ''; }
    if (is_array($home) && !empty($home['host']) && strtolower((string) $home['host']) === strtolower((string) $parts['host'])) { return ''; }
    return $url;
}

function seogrow_shared_link_anchor_text($html) {
    $text = wp_strip_all_tags((string) $html, true);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\s+/u', ' ', $text);
    return mb_substr(trim((string) $text), 0, 500);
}

function seogrow_shared_link_transform_html($html, $target_url, $mode, &$anchors, &$count) {
    $pattern = '~<a\b([^>]*?\bhref\s*=\s*(["\'])([^"\']+)\2[^>]*)>([\s\S]*?)</a\s*>~i';
    return preg_replace_callback($pattern, static function ($match) use ($target_url, $mode, &$anchors, &$count) {
        $href = html_entity_decode((string) $match[3], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($href !== $target_url) { return $match[0]; }
        $inner = (string) $match[4];
        $anchors[] = seogrow_shared_link_anchor_text($inner);
        $count += 1;
        return $mode === 'delete-anchor-text' ? '' : $inner;
    }, (string) $html);
}

function seogrow_shared_link_walk(&$value, $target_url, $mode, &$anchors, &$count, $depth = 0, &$nodes = 0) {
    if ($depth > 90 || ++$nodes > 12000) { return false; }
    if (is_array($value)) {
        foreach ($value as &$child) {
            if (!seogrow_shared_link_walk($child, $target_url, $mode, $anchors, $count, $depth + 1, $nodes)) { return false; }
        }
        unset($child);
        return true;
    }
    if (is_string($value)) {
        $value = seogrow_shared_link_transform_html($value, $target_url, $mode, $anchors, $count);
        return is_string($value);
    }
    return is_null($value) || is_bool($value) || is_int($value) || is_float($value);
}

function seogrow_shared_link_transform_data($raw, $target_url, $mode) {
    if (!is_string($raw) || $raw === '' || strlen($raw) > 1048576) {
        return array('ok' => false, 'count' => 0, 'anchors' => array(), 'value' => '');
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return array('ok' => false, 'count' => 0, 'anchors' => array(), 'value' => '');
    }
    $anchors = array();
    $count = 0;
    $nodes = 0;
    if (!seogrow_shared_link_walk($decoded, $target_url, $mode, $anchors, $count, 0, $nodes)) {
        return array('ok' => false, 'count' => 0, 'anchors' => array(), 'value' => '');
    }
    $encoded = wp_json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($encoded)) {
        return array('ok' => false, 'count' => 0, 'anchors' => array(), 'value' => '');
    }
    return array(
        'ok' => true,
        'count' => (int) $count,
        'anchors' => array_values($anchors),
        'value' => $encoded,
    );
}

function seogrow_shared_link_conditions($id) {
    $observed = metadata_exists('post', $id, '_elementor_conditions');
    $raw = $observed ? get_post_meta($id, '_elementor_conditions', true) : array();
    $values = function_exists('seogrow_connector_elementor_condition_values')
        ? seogrow_connector_elementor_condition_values($raw)
        : array();
    return array($observed, $values);
}

function seogrow_shared_link_scan(WP_REST_Request $request) {
    if (!(defined('ELEMENTOR_VERSION') || class_exists('Elementor\\Plugin'))) {
        return seogrow_shared_link_error('ELEMENTOR_UNAVAILABLE', 'Elementor non risulta attivo.', 409);
    }
    $target = seogrow_shared_link_target($request->get_param('targetUrl'));
    if (!$target) {
        return seogrow_shared_link_error('SHARED_LINK_TARGET_INVALID', 'Il link esterno da cercare non è valido.', 400);
    }
    $ids = get_posts(array(
        'post_type' => 'elementor_library',
        'post_status' => 'publish',
        'fields' => 'ids',
        'posts_per_page' => 200,
        'no_found_rows' => true,
        'orderby' => 'ID',
        'order' => 'DESC',
    ));
    $matches = array();
    foreach ((array) $ids as $id) {
        $id = absint($id);
        if (!$id || !current_user_can('edit_post', $id)) { continue; }
        $type = sanitize_key((string) get_post_meta($id, '_elementor_template_type', true));
        if (!in_array($type, seogrow_shared_link_allowed_types(), true)) { continue; }
        $raw = get_post_meta($id, '_elementor_data', true);
        if (!is_string($raw) || $raw === '') { continue; }
        $transformed = seogrow_shared_link_transform_data($raw, $target, 'unlink-preserve-text');
        if (!$transformed['ok'] || $transformed['count'] < 1) { continue; }
        list($conditions_observed, $conditions) = seogrow_shared_link_conditions($id);
        $link = get_permalink($id);
        $matches[] = array(
            'id' => $id,
            'type' => $type,
            'title' => get_the_title($id),
            'status' => (string) get_post_status($id),
            'link' => is_string($link) ? $link : '',
            'occurrenceCount' => (int) $transformed['count'],
            'anchorTexts' => array_values($transformed['anchors']),
            'conditionsObserved' => (bool) $conditions_observed,
            'conditions' => $conditions,
            'dataHash' => hash('sha256', $raw),
            'elementorData' => $raw,
            'writeEligibleByDocument' => $transformed['count'] === 1,
            'readOnly' => true,
        );
        if (count($matches) >= 20) { break; }
    }
    return rest_ensure_response(array(
        'ok' => true,
        'readOnly' => true,
        'resource' => 'elementor-shared-link-scan',
        'targetUrl' => $target,
        'matches' => $matches,
        'matchCount' => count($matches),
        'sharedWriteAllowed' => false,
    ));
}

function seogrow_shared_link_meta_row($rows, $key) {
    $matches = array_values(array_filter($rows, static function ($row) use ($key) {
        return isset($row['meta_key']) && (string) $row['meta_key'] === $key;
    }));
    return count($matches) === 1 ? $matches[0] : null;
}

function seogrow_shared_link_write(WP_REST_Request $request) {
    global $wpdb;
    $id = absint($request->get_param('id'));
    $target = seogrow_shared_link_target($request->get_param('targetUrl'));
    $mode = seogrow_shared_link_mode($request->get_param('mode'));
    $operation = (string) $request->get_param('operation');
    $expected = $request->get_param('expectedCurrent');
    $changes = $request->get_param('changes');
    if (!$id || !$target || !in_array($operation, array('apply', 'rollback'), true) || !is_string($expected) || !is_string($changes)) {
        return seogrow_shared_link_error('SHARED_LINK_WRITE_INVALID', 'Payload di correzione shared Elementor non valido.', 400);
    }
    if (strlen($expected) > 1048576 || strlen($changes) > 1048576 || $expected === $changes) {
        return seogrow_shared_link_error('SHARED_LINK_WRITE_INVALID', 'Snapshot Elementor non valido o troppo grande.', 400);
    }
    $post = get_post($id);
    $type = sanitize_key((string) get_post_meta($id, '_elementor_template_type', true));
    if (!$post || $post->post_type !== 'elementor_library' || $post->post_status !== 'publish' || !in_array($type, seogrow_shared_link_allowed_types(), true)) {
        return seogrow_shared_link_error('SHARED_LINK_TEMPLATE_INVALID', 'Il documento non è un template Elementor condiviso pubblicato supportato.', 409);
    }
    if (!current_user_can('edit_post', $id)) {
        return seogrow_shared_link_error('SHARED_LINK_FORBIDDEN', 'Permessi insufficienti per modificare il template Elementor.', 403);
    }

    $source_for_validation = $operation === 'apply' ? $expected : $changes;
    $transition = seogrow_shared_link_transform_data($source_for_validation, $target, $mode);
    $expected_result = $operation === 'apply' ? $changes : $expected;
    if (!$transition['ok'] || $transition['count'] !== 1 || $transition['value'] !== $expected_result) {
        return seogrow_shared_link_error('SHARED_LINK_TRANSITION_INVALID', 'La modifica non coincide con una singola rimozione deterministica del link condiviso.', 409);
    }

    foreach (array($wpdb->posts, $wpdb->postmeta) as $table) {
        $engine = $wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s', $table));
        if (strtoupper((string) $engine) !== 'INNODB') {
            return seogrow_shared_link_error('ATOMIC_WRITE_UNAVAILABLE', 'Scrittura atomica non disponibile per questo database.', 409);
        }
    }
    if ((string) $wpdb->get_var('SELECT @@session.autocommit') !== '1' || $wpdb->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') === false || $wpdb->query('START TRANSACTION') === false) {
        return seogrow_shared_link_error('ATOMIC_WRITE_UNAVAILABLE', 'Impossibile avviare la transazione atomica.', 409);
    }

    $committed = false;
    try {
        $locked_post = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id), ARRAY_A);
        $rows = $wpdb->get_results($wpdb->prepare("SELECT meta_id, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d FOR UPDATE", $id), ARRAY_A);
        $data = seogrow_shared_link_meta_row($rows, '_elementor_data');
        $locked_type = seogrow_shared_link_meta_row($rows, '_elementor_template_type');
        $edit_mode = seogrow_shared_link_meta_row($rows, '_elementor_edit_mode');
        if (!$locked_post || $locked_post['post_type'] !== 'elementor_library' || $locked_post['post_status'] !== 'publish' || !$data || !$locked_type || !$edit_mode ||
            !in_array((string) $locked_type['meta_value'], seogrow_shared_link_allowed_types(), true) || (string) $edit_mode['meta_value'] !== 'builder') {
            throw new RuntimeException('unsupported');
        }
        if ((string) $data['meta_value'] !== $expected) { throw new RuntimeException('stale'); }
        $affected = $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->postmeta} SET meta_value = %s WHERE meta_id = %d AND post_id = %d AND meta_key = '_elementor_data' AND BINARY meta_value = BINARY %s",
            $changes,
            (int) $data['meta_id'],
            $id,
            $expected
        ));
        if ($affected === false || (int) $affected !== 1) { throw new RuntimeException('stale'); }
        $observed = $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_id = %d FOR UPDATE", (int) $data['meta_id']));
        if (!is_string($observed) || $observed !== $changes) { throw new RuntimeException('result'); }
        if ($wpdb->query('COMMIT') === false) { throw new RuntimeException('commit'); }
        $committed = true;

        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
        if (function_exists('seogrow_connector_clear_elementor_cache')) {
            seogrow_connector_clear_elementor_cache((int) $data['meta_id'], $id, '_elementor_data');
        }
        $final = get_post_meta($id, '_elementor_data', true);
        if (!is_string($final) || $final !== $changes) {
            return seogrow_shared_link_error('ATOMIC_RESULT_UNVERIFIED', 'Il template è stato scritto ma il valore finale non è stato confermato.', 409);
        }
        return rest_ensure_response(array(
            'ok' => true,
            'atomicGuaranteed' => true,
            'staleChecked' => true,
            'operation' => $operation,
            'resource' => 'elementor_library',
            'id' => $id,
            'templateType' => $type,
            'templateTitle' => get_the_title($id),
            'targetUrl' => $target,
            'mode' => $mode,
            'anchorText' => isset($transition['anchors'][0]) ? $transition['anchors'][0] : '',
            'beforeData' => $expected,
            'afterData' => $changes,
            'beforeHash' => hash('sha256', $expected),
            'afterHash' => hash('sha256', $changes),
            'changed' => array('meta._elementor_data'),
            'requiresFrontendVerification' => true,
            'sharedWriteAllowed' => true,
            'scope' => 'elementor-shared-single-external-link-cas-v1',
        ));
    } catch (Throwable $error) {
        if (!$committed) { $wpdb->query('ROLLBACK'); }
        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
        if ($error->getMessage() === 'stale') {
            return seogrow_shared_link_error('STALE_CONFLICT', 'Il template Elementor è cambiato dopo l’anteprima. Nessuna modifica applicata.', 409);
        }
        return seogrow_shared_link_error('ATOMIC_WRITE_UNAVAILABLE', 'Scrittura atomica del template condiviso non completata.', 409);
    }
}

add_action('rest_api_init', static function () {
    register_rest_route('seogrow/v1', '/elementor-shared-link-scan', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_shared_link_scan',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
    ));
    register_rest_route('seogrow/v1', '/elementor-shared-link-write', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_shared_link_write',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
    ));
});
