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

function seogrow_connector_atomic_seo_meta_keys() {
    return array(
        'rank_math_title',
        'rank_math_description',
        'rank_math_canonical_url',
        '_yoast_wpseo_title',
        '_yoast_wpseo_metadesc',
        '_yoast_wpseo_canonical',
        '_yoast_wpseo_meta-robots-noindex',
    );
}

function seogrow_connector_atomic_is_seo_meta_request($expected, $changes) {
    if (!is_array($expected) || !is_array($changes)) { return false; }
    if (array_keys($expected) !== array('meta') || array_keys($changes) !== array('meta')) { return false; }
    if (!is_array($expected['meta']) || !is_array($changes['meta'])) { return false; }
    if (count($expected['meta']) !== 1 || count($changes['meta']) !== 1) { return false; }
    $expected_keys = array_keys($expected['meta']);
    $change_keys = array_keys($changes['meta']);
    if ($expected_keys !== $change_keys) { return false; }
    $key = $change_keys[0];
    if (!in_array($key, seogrow_connector_atomic_seo_meta_keys(), true)) { return false; }
    return is_string($expected['meta'][$key]) && is_string($changes['meta'][$key]);
}

function seogrow_connector_atomic_seo_meta_write(WP_REST_Request $request) {
    global $wpdb;
    $resource = (string) $request->get_param('resource');
    $id = (int) $request->get_param('id');
    $expected = $request->get_param('expectedCurrent');
    $changes = $request->get_param('changes');

    if (!in_array($resource, array('posts', 'pages'), true) || $id <= 0 || !current_user_can('edit_post', $id)) {
        return new WP_Error('ATOMIC_WRITE_FORBIDDEN', 'Identità o permessi WordPress non validi.', array('status' => 403));
    }
    if (!seogrow_connector_atomic_is_seo_meta_request($expected, $changes)) {
        return seogrow_connector_atomic_unavailable();
    }

    $key = array_keys($changes['meta'])[0];
    $before_value = $expected['meta'][$key];
    $after_value = $changes['meta'][$key];
    if (strlen($before_value) > 4096 || strlen($after_value) > 4096) {
        return new WP_Error('ATOMIC_META_VALUE_INVALID', 'Valore meta SEO troppo grande per la scrittura atomica.', array('status' => 400));
    }

    $post_type = $resource === 'posts' ? 'post' : 'page';
    foreach (array($wpdb->posts, $wpdb->postmeta) as $table) {
        $engine = $wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s', $table));
        if (strtoupper((string) $engine) !== 'INNODB') { return seogrow_connector_atomic_unavailable(); }
    }
    if ((string) $wpdb->get_var('SELECT @@session.autocommit') !== '1' || $wpdb->query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ') === false) {
        return seogrow_connector_atomic_unavailable();
    }
    if ($wpdb->query('START TRANSACTION') === false) { return seogrow_connector_atomic_unavailable(); }

    $committed = false;
    try {
        $post = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id), ARRAY_A);
        if (!$post || $post['post_type'] !== $post_type) { throw new RuntimeException('identity'); }

        // Lock the complete post_id metadata range. Under InnoDB + REPEATABLE READ
        // this protects existing rows and the insertion gap for this post while
        // SeoGrow verifies/creates the one allowed SEO metadata row.
        $rows = $wpdb->get_results($wpdb->prepare("SELECT meta_id, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d FOR UPDATE", $id), ARRAY_A);
        if (!is_array($rows)) { throw new RuntimeException('storage'); }
        $matches = array_values(array_filter($rows, static function ($row) use ($key) {
            return isset($row['meta_key']) && (string) $row['meta_key'] === $key;
        }));
        if (count($matches) > 1) { throw new RuntimeException('ambiguous_meta'); }

        $inserted = false;
        if (count($matches) === 0) {
            if ($before_value !== '') { throw new RuntimeException('stale'); }
            if ($after_value === '') { throw new RuntimeException('no_change_absent'); }
            $affected = $wpdb->query($wpdb->prepare(
                "INSERT INTO {$wpdb->postmeta} (post_id, meta_key, meta_value) VALUES (%d, %s, %s)",
                $id,
                $key,
                $after_value
            ));
            if ($affected === false || (int) $affected !== 1) { throw new RuntimeException('db_failure'); }
            $created = $wpdb->get_results($wpdb->prepare(
                "SELECT meta_id, meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s FOR UPDATE",
                $id,
                $key
            ), ARRAY_A);
            if (!is_array($created) || count($created) !== 1 || !seogrow_connector_atomic_exact_equal((string) $created[0]['meta_value'], $after_value)) {
                throw new RuntimeException('result');
            }
            $meta = $created[0];
            $inserted = true;
        } else {
            $meta = $matches[0];
            if (!seogrow_connector_atomic_exact_equal((string) $meta['meta_value'], $before_value)) {
                throw new RuntimeException('stale');
            }
        }

        $no_write_required = !$inserted && seogrow_connector_atomic_exact_equal($before_value, $after_value);
        if (!$no_write_required && !$inserted) {
            $affected = $wpdb->query($wpdb->prepare(
                "UPDATE {$wpdb->postmeta} SET meta_value = %s WHERE meta_id = %d AND post_id = %d AND meta_key = %s AND BINARY meta_value = BINARY %s",
                $after_value,
                (int) $meta['meta_id'],
                $id,
                $key,
                $before_value
            ));
            if ($affected === false) { throw new RuntimeException('db_failure'); }
            if ((int) $affected !== 1) { throw new RuntimeException('stale'); }
        }

        $locked_after = $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_id = %d FOR UPDATE", (int) $meta['meta_id']));
        if (!is_string($locked_after) || !seogrow_connector_atomic_exact_equal($locked_after, $after_value)) {
            throw new RuntimeException('result');
        }
        if ($wpdb->query('COMMIT') === false) { throw new RuntimeException('commit'); }
        $committed = true;

        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
        $observed = $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_id = %d", (int) $meta['meta_id']));
        if (!is_string($observed) || !seogrow_connector_atomic_exact_equal($observed, $after_value)) {
            return new WP_Error('ATOMIC_RESULT_UNVERIFIED', 'Meta SEO scritto ma valore finale non confermato. Riverifica prima di continuare.', array('status' => 409));
        }
        $post_after = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id), ARRAY_A);
        if (!$post_after || $post_after['post_type'] !== $post_type) {
            return new WP_Error('ATOMIC_RESULT_UNVERIFIED', 'Meta SEO scritto ma identità finale della risorsa non confermata.', array('status' => 409));
        }
        $entity = seogrow_connector_atomic_entity($post_after, $id);
        $entity['meta'] = array($key => $observed);
        return array(
            'ok' => true,
            'atomicGuaranteed' => true,
            'staleChecked' => true,
            'operation' => (string) $request->get_param('operation'),
            'resource' => $resource,
            'noWriteRequired' => $no_write_required,
            'createdMetaRow' => $inserted,
            'entity' => $entity,
            'scope' => 'single-seo-postmeta-cas-v1',
            'requiresFrontendVerification' => true,
        );
    } catch (Throwable $error) {
        if (!$committed) { $wpdb->query('ROLLBACK'); }
        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
        if ($committed) {
            return new WP_Error('ATOMIC_RESULT_UNVERIFIED', 'Esito della scrittura meta SEO da verificare. Nessun nuovo tentativo automatico eseguito.', array('status' => 409));
        }
        if ($error->getMessage() === 'stale') {
            return new WP_Error('STALE_CONFLICT', 'Il meta SEO è cambiato dopo l’anteprima. Nessuna sovrascrittura eseguita.', array('status' => 409));
        }
        if ($error->getMessage() === 'ambiguous_meta') {
            return new WP_Error('ATOMIC_WRITE_UNAVAILABLE', 'Scrittura meta SEO bloccata: esistono più righe postmeta per lo stesso campo. Nessuna modifica applicata.', array('status' => 409));
        }
        if ($error->getMessage() === 'no_change_absent') {
            return new WP_Error('ATOMIC_WRITE_UNAVAILABLE', 'Il meta SEO non esiste e la proposta non introduce alcun valore. Nessuna modifica necessaria.', array('status' => 409));
        }
        if ($error->getMessage() === 'identity') {
            return new WP_Error('ATOMIC_IDENTITY_CONFLICT', 'La risorsa WordPress è cambiata prima della scrittura.', array('status' => 409));
        }
        return seogrow_connector_atomic_unavailable();
    }
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

    // Taxonomy storage remains fail-closed until its plugin-owned persistence can
    // expose the same atomic compare-and-swap guarantees as posts/postmeta.
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

    // SEO metadata uses a dedicated single-row postmeta CAS. Elementor remains
    // on its own native-document transaction because it has wider side effects.
    if (array_key_exists('meta', $changes)) {
        if (seogrow_connector_atomic_is_seo_meta_request($expected, $changes)) {
            return seogrow_connector_atomic_seo_meta_write($request);
        }
        return function_exists('seogrow_connector_elementor_text_write') ? seogrow_connector_elementor_text_write($request) : seogrow_connector_atomic_unavailable();
    }
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
