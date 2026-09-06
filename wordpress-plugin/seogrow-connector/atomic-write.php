<?php
if (!defined('ABSPATH')) { exit; }

/** No generic WordPress/plugin save path currently provides a proven CAS.
 * Never turn an advisory lock or a GET/check/POST sequence into atomic=true.
 */
function seogrow_connector_atomic_unavailable() {
    return new WP_Error('ATOMIC_WRITE_UNAVAILABLE', 'Scrittura bloccata: confronto e aggiornamento atomici non garantiti per questo storage WordPress. Nessuna modifica applicata.', array('status' => 409));
}

function seogrow_connector_atomic_write(WP_REST_Request $request) {
    if (!in_array($request->get_param('operation'), array('apply', 'rollback'), true)) {
        return new WP_Error('ATOMIC_OPERATION_REQUIRED', 'Operazione apply o rollback obbligatoria.', array('status' => 400));
    }
    $resource = $request->get_param('resource');
    $expected = $request->get_param('expectedCurrent');
    $changes = $request->get_param('changes');
    if (!is_array($expected) || !count($expected) || !is_array($changes) || !count($changes)) {
        return new WP_Error('EXPECTED_CURRENT_REQUIRED', 'Snapshot e modifiche completi obbligatori.', array('status' => 400));
    }
    if ($resource === 'taxonomy') {
        $term = seogrow_connector_find_exact_taxonomy_term(esc_url_raw((string) $request->get_param('url')));
        if (is_wp_error($term)) { return $term; }
        if ((int) $term->term_id !== (int) $request->get_param('id') || !current_user_can('edit_term', $term->term_id)) {
            return new WP_Error('ATOMIC_IDENTITY_FORBIDDEN', 'Identità o permessi tassonomia non validi.', array('status' => 403));
        }
        $field = (string) $request->get_param('field');
        if (count($changes) !== 1 || !array_key_exists($field, $changes) || !array_key_exists($field, $expected)) {
            return new WP_Error('EXPECTED_CURRENT_REQUIRED', 'Snapshot single-field obbligatorio.', array('status' => 400));
        }
        $validation = seogrow_connector_taxonomy_validate_write($term, (string) $request->get_param('adapter'), $field, $changes[$field], $expected[$field]);
        if (is_wp_error($validation)) { return $validation; }
        return seogrow_connector_atomic_unavailable();
    }
    if (!in_array($resource, array('posts', 'pages'), true)) { return seogrow_connector_atomic_unavailable(); }
    $id = (int) $request->get_param('id');
    if ($id <= 0 || !current_user_can('edit_post', $id)) {
        return new WP_Error('ATOMIC_WRITE_FORBIDDEN', 'Permessi insufficienti.', array('status' => 403));
    }
    // Bypass object caches for the diagnostic comparison. No write follows
    // this read unless a future, separately verified atomic adapter exists.
    global $wpdb;
    $post = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id), ARRAY_A);
    if (!$post || $post['post_type'] !== ($resource === 'posts' ? 'post' : 'page')) {
        return new WP_Error('ATOMIC_IDENTITY_CONFLICT', 'Risorsa WordPress cambiata.', array('status' => 409));
    }
    $fields = array('title' => 'post_title', 'content' => 'post_content', 'excerpt' => 'post_excerpt');
    foreach ($changes as $field => $value) {
        if ($field === 'meta') {
            if (!is_array($value) || !isset($expected['meta']) || !is_array($expected['meta'])) {
                return new WP_Error('EXPECTED_CURRENT_REQUIRED', 'Snapshot meta completo obbligatorio.', array('status' => 400));
            }
            foreach ($value as $key => $unused) {
                if (!array_key_exists($key, $expected['meta'])) {
                    return new WP_Error('EXPECTED_CURRENT_REQUIRED', 'Snapshot meta mancante.', array('status' => 400));
                }
                if (!current_user_can('edit_post_meta', $id, $key)) {
                    return new WP_Error('ATOMIC_WRITE_FORBIDDEN', 'Permessi meta insufficienti.', array('status' => 403));
                }
                $rows = $wpdb->get_col($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s", $id, $key));
                // Missing or duplicate rows cannot prove a unique writable owner.
                if (!is_array($rows) || count($rows) !== 1) { return seogrow_connector_atomic_unavailable(); }
                if (maybe_unserialize($rows[0]) !== $expected['meta'][$key]) {
                    return new WP_Error('STALE_CONFLICT', 'Il meta è cambiato dopo l’anteprima. Nessuna modifica applicata.', array('status' => 409));
                }
            }
            continue;
        }
        if (!isset($fields[$field]) || !array_key_exists($field, $expected)) {
            return new WP_Error('EXPECTED_CURRENT_REQUIRED', 'Campo non supportato o snapshot mancante.', array('status' => 400));
        }
        if ($post[$fields[$field]] !== $expected[$field]) {
            return new WP_Error('STALE_CONFLICT', 'Il campo è cambiato dopo l’anteprima. Nessuna modifica applicata.', array('status' => 409));
        }
    }
    return seogrow_connector_atomic_unavailable();
}

add_action('rest_api_init', static function () {
    register_rest_route('seogrow/v1', '/atomic-write', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_atomic_write',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages') || current_user_can('manage_categories');
        },
    ));
});
