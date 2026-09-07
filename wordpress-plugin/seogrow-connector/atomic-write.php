<?php
if (!defined('ABSPATH')) { exit; }

function seogrow_connector_atomic_unavailable() {
    return new WP_Error('ATOMIC_WRITE_UNAVAILABLE', 'Scrittura bloccata: confronto e aggiornamento atomici non garantiti per questo storage WordPress. Nessuna modifica applicata.', array('status' => 409));
}

function seogrow_connector_atomic_exact_equal($left, $right) {
    return is_string($left) && is_string($right) && $left === $right;
}

function seogrow_connector_atomic_entity($row, $id) {
    return array(
        'id' => (int) $id,
        'status' => isset($row['post_status']) ? (string) $row['post_status'] : '',
        'link' => function_exists('get_permalink') ? (string) get_permalink($id) : '',
        'title' => array('raw' => isset($row['post_title']) ? (string) $row['post_title'] : ''),
        'content' => array('raw' => isset($row['post_content']) ? (string) $row['post_content'] : ''),
        'excerpt' => array('raw' => isset($row['post_excerpt']) ? (string) $row['post_excerpt'] : ''),
    );
}

function seogrow_connector_atomic_write(WP_REST_Request $request) {
    $operation = (string) $request->get_param('operation');
    if (!in_array($operation, array('apply', 'rollback'), true)) {
        return new WP_Error('ATOMIC_OPERATION_REQUIRED', 'Operazione apply o rollback obbligatoria.', array('status' => 400));
    }
    $resource = $request->get_param('resource');
    $expected = $request->get_param('expectedCurrent');
    $changes = $request->get_param('changes');
    if (!is_array($expected) || !count($expected) || !is_array($changes) || !count($changes)) {
        return new WP_Error('EXPECTED_CURRENT_REQUIRED', 'Snapshot e modifiche completi obbligatori.', array('status' => 400));
    }

    // Taxonomy/plugin-meta ownership does not currently expose a single-row CAS
    // primitive that SeoGrow can prove. Keep it fail-closed.
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

    // Core post/page fields are stored on one wp_posts row, so they can be
    // updated with a single SQL compare-and-swap statement. Meta is a separate
    // row set and remains blocked to avoid a partially atomic mixed write.
    if (array_key_exists('meta', $changes)) { return seogrow_connector_atomic_unavailable(); }
    $fields = array('title' => 'post_title', 'content' => 'post_content', 'excerpt' => 'post_excerpt');
    foreach ($changes as $field => $value) {
        if (!isset($fields[$field]) || !array_key_exists($field, $expected) || !is_string($value) || !is_string($expected[$field])) {
            return new WP_Error('EXPECTED_CURRENT_REQUIRED', 'Campo non supportato o snapshot mancante.', array('status' => 400));
        }
    }

    global $wpdb;
    $post_type = $resource === 'posts' ? 'post' : 'page';
    $before = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id), ARRAY_A);
    if (!$before || $before['post_type'] !== $post_type) {
        return new WP_Error('ATOMIC_IDENTITY_CONFLICT', 'Risorsa WordPress cambiata.', array('status' => 409));
    }
    foreach ($expected as $field => $value) {
        if (isset($fields[$field]) && !seogrow_connector_atomic_exact_equal((string) $before[$fields[$field]], $value)) {
            return new WP_Error('STALE_CONFLICT', 'Il contenuto è cambiato dopo l’anteprima. Nessuna modifica applicata.', array('status' => 409));
        }
    }

    $no_write_required = true;
    foreach ($changes as $field => $value) {
        if (!seogrow_connector_atomic_exact_equal($expected[$field], $value)) { $no_write_required = false; break; }
    }

    if (!$no_write_required) {
        $set_parts = array();
        $where_parts = array('ID = %d', 'post_type = %s');
        $args = array();
        foreach ($changes as $field => $value) {
            $set_parts[] = $fields[$field] . ' = %s';
            $args[] = $value;
        }
        $args[] = $id;
        $args[] = $post_type;
        // Compare every expected core field, not just the field being changed.
        // BINARY makes the precondition byte-exact even on case-insensitive collations.
        foreach ($expected as $field => $value) {
            if (!isset($fields[$field]) || !is_string($value)) {
                return new WP_Error('EXPECTED_CURRENT_REQUIRED', 'Snapshot contiene un campo non supportato.', array('status' => 400));
            }
            $where_parts[] = 'BINARY ' . $fields[$field] . ' = BINARY %s';
            $args[] = $value;
        }
        $sql = "UPDATE {$wpdb->posts} SET " . implode(', ', $set_parts) . ' WHERE ' . implode(' AND ', $where_parts);
        $affected = $wpdb->query($wpdb->prepare($sql, $args));
        if ($affected === false) {
            return new WP_Error('ATOMIC_RESULT_UNVERIFIED', 'Il database non ha confermato la scrittura atomica. Esito da verificare.', array('status' => 500));
        }
        if ((int) $affected !== 1) {
            $now = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id), ARRAY_A);
            if (!$now || $now['post_type'] !== $post_type) {
                return new WP_Error('ATOMIC_IDENTITY_CONFLICT', 'Risorsa WordPress cambiata durante la scrittura.', array('status' => 409));
            }
            foreach ($expected as $field => $value) {
                if (!seogrow_connector_atomic_exact_equal((string) $now[$fields[$field]], $value)) {
                    return new WP_Error('STALE_CONFLICT', 'Il contenuto è cambiato durante la scrittura atomica. Nessuna sovrascrittura eseguita.', array('status' => 409));
                }
            }
            return new WP_Error('ATOMIC_RESULT_UNVERIFIED', 'La compare-and-swap non ha modificato esattamente una riga. Esito da verificare.', array('status' => 409));
        }
    }

    if (function_exists('clean_post_cache')) { clean_post_cache($id); }
    $after = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id), ARRAY_A);
    if (!$after || $after['post_type'] !== $post_type) {
        return new WP_Error('ATOMIC_RESULT_UNVERIFIED', 'Scrittura eseguita ma identità finale non verificabile.', array('status' => 409));
    }
    foreach ($changes as $field => $value) {
        if (!seogrow_connector_atomic_exact_equal((string) $after[$fields[$field]], $value)) {
            return new WP_Error('ATOMIC_RESULT_UNVERIFIED', 'Scrittura eseguita ma valore finale cambiato prima della conferma.', array('status' => 409));
        }
    }

    return array(
        'ok' => true,
        'atomicGuaranteed' => true,
        'staleChecked' => true,
        'operation' => $operation,
        'resource' => $resource,
        'noWriteRequired' => $no_write_required,
        'entity' => seogrow_connector_atomic_entity($after, $id),
    );
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
