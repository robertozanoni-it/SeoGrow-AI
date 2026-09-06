<?php

if (!defined('ABSPATH')) {
    exit;
}

function seogrow_connector_rank_math_db_rows($term_id, $meta_key) {
    global $wpdb;
    $rows = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT meta_id, meta_value FROM {$wpdb->termmeta} WHERE term_id = %d AND meta_key = %s ORDER BY meta_id ASC",
            absint($term_id),
            (string) $meta_key
        ),
        ARRAY_A
    );
    return is_array($rows) ? $rows : array();
}

function seogrow_connector_rank_math_db_value($field, $rows) {
    if (count($rows) !== 1) {
        return null;
    }
    $raw = maybe_unserialize($rows[0]['meta_value'] ?? '');
    if ($field === 'noindex') {
        $robots = array_values(array_filter((array) $raw, 'is_scalar'));
        return in_array('noindex', array_map('strtolower', array_map('strval', $robots)), true);
    }
    return is_scalar($raw) ? (string) $raw : '';
}

function seogrow_connector_persistence_error_response($code, $message, $status, $extra = array()) {
    return new WP_REST_Response(array_merge(array(
        'code' => (string) $code,
        'message' => (string) $message,
        'data' => array('status' => (int) $status),
    ), is_array($extra) ? $extra : array()), (int) $status);
}

function seogrow_connector_rank_math_persistence_capability() {
    return rest_ensure_response(array(
        'ok' => true,
        'readOnly' => true,
        'resource' => 'taxonomy-persistence-capability',
        'rankMathPersistenceProof' => true,
        'proofSource' => 'wp_termmeta+get_term_meta',
        'crossRequestCacheCoherence' => true,
        'writesPerformed' => 0,
    ));
}

add_action('rest_api_init', static function () {
    register_rest_route('seogrow/v1', '/taxonomy-persistence-capability', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_rank_math_persistence_capability',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
    ));
});

function seogrow_connector_rank_math_inspection_cache_coherence($response, $server, $request) {
    if (!($request instanceof WP_REST_Request) || $request->get_route() !== '/seogrow/v1/taxonomy-inspect') {
        return $response;
    }
    if (strtoupper((string) $request->get_method()) !== 'GET') {
        return $response;
    }

    $rest_response = rest_ensure_response($response);
    if ($rest_response->get_status() < 200 || $rest_response->get_status() >= 300) {
        return $response;
    }
    $data = $rest_response->get_data();
    if (
        !is_array($data) ||
        ($data['ok'] ?? false) !== true ||
        ($data['readOnly'] ?? false) !== true ||
        ($data['resource'] ?? '') !== 'taxonomy' ||
        ($data['plugins']['rankMath'] ?? false) !== true ||
        ($data['plugins']['yoast'] ?? false) === true
    ) {
        return $response;
    }

    $term_id = absint($data['term']['id'] ?? 0);
    $taxonomy = sanitize_key((string) ($data['term']['taxonomy'] ?? ''));
    if (!$term_id || !in_array($taxonomy, array('category', 'post_tag'), true)) {
        return $response;
    }

    $rows = seogrow_connector_rank_math_db_rows($term_id, 'rank_math_description');
    if (count($rows) !== 1) {
        $data['cacheCoherence'] = array(
            'checked' => true,
            'coherent' => false,
            'repaired' => false,
            'dbRowCount' => count($rows),
            'persistentWritesPerformed' => 0,
        );
        $rest_response->set_data($data);
        return $rest_response;
    }

    $db_value = seogrow_connector_rank_math_db_value('meta_description', $rows);
    $api_value = (string) ($data['seo']['rankMath']['meta_description'] ?? '');
    if ($db_value === $api_value) {
        $data['cacheCoherence'] = array(
            'checked' => true,
            'coherent' => true,
            'repaired' => false,
            'dbRowCount' => 1,
            'persistentWritesPerformed' => 0,
        );
        $rest_response->set_data($data);
        return $rest_response;
    }

    wp_cache_delete($term_id, 'term_meta');
    clean_term_cache($term_id, $taxonomy);
    $fresh = get_term($term_id, $taxonomy);
    if (!$fresh || is_wp_error($fresh)) {
        return seogrow_connector_persistence_error_response(
            'seogrow_taxonomy_cache_refresh_failed',
            'Divergenza Rank Math rilevata tra cache/API e database, ma la rilettura dopo invalidazione cache non è riuscita.',
            409,
            array('persistentWritesPerformed' => 0)
        );
    }

    $fresh_data = seogrow_connector_taxonomy_inspection_payload($fresh);
    if (is_wp_error($fresh_data)) {
        return $fresh_data;
    }
    $fresh_api_value = (string) ($fresh_data['seo']['rankMath']['meta_description'] ?? '');
    if ($fresh_api_value !== $db_value) {
        return seogrow_connector_persistence_error_response(
            'seogrow_taxonomy_cache_divergence',
            'Divergenza Rank Math persistente: get_term_meta non coincide con wp_termmeta anche dopo invalidazione della cache term_meta.',
            409,
            array(
                'dbRowCount' => 1,
                'persistentWritesPerformed' => 0,
            )
        );
    }

    $fresh_data['cacheCoherence'] = array(
        'checked' => true,
        'coherent' => true,
        'repaired' => true,
        'dbRowCount' => 1,
        'persistentWritesPerformed' => 0,
    );
    return rest_ensure_response($fresh_data);
}
add_filter('rest_post_dispatch', 'seogrow_connector_rank_math_inspection_cache_coherence', 15, 3);

function seogrow_connector_rank_math_persistence_proof($response, $server, $request) {
    if (!($request instanceof WP_REST_Request) || $request->get_route() !== '/seogrow/v1/taxonomy-write') {
        return $response;
    }
    if (strtoupper((string) $request->get_method()) !== 'POST') {
        return $response;
    }

    $rest_response = rest_ensure_response($response);
    if ($rest_response->get_status() < 200 || $rest_response->get_status() >= 300) {
        return $response;
    }
    $data = $rest_response->get_data();
    if (!is_array($data) || ($data['ok'] ?? false) !== true || ($data['adapter'] ?? '') !== 'rank-math') {
        return $response;
    }

    $term_id = absint($data['term']['id'] ?? 0);
    $field = sanitize_key((string) ($data['field'] ?? ''));
    $expected = $data['after'] ?? null;
    $keys = array(
        'title' => 'rank_math_title',
        'meta_description' => 'rank_math_description',
        'canonical' => 'rank_math_canonical_url',
        'noindex' => 'rank_math_robots',
    );
    if (!$term_id || !isset($keys[$field])) {
        return seogrow_connector_persistence_error_response(
            'seogrow_taxonomy_persistence_proof_invalid',
            'Scrittura Rank Math completata ma la prova di persistenza non dispone di identità sufficiente.',
            500
        );
    }

    $rows = seogrow_connector_rank_math_db_rows($term_id, $keys[$field]);
    if (count($rows) !== 1) {
        return seogrow_connector_persistence_error_response(
            'seogrow_taxonomy_db_ambiguous',
            'Scrittura Rank Math non certificata: il database non contiene esattamente una riga per il meta target.',
            409,
            array('dbRowCount' => count($rows))
        );
    }

    $db_value = seogrow_connector_rank_math_db_value($field, $rows);
    $api_value = $field === 'noindex'
        ? (bool) seogrow_connector_taxonomy_field_value(seogrow_connector_rank_math_term_values($term_id), $field)
        : (string) seogrow_connector_taxonomy_field_value(seogrow_connector_rank_math_term_values($term_id), $field);
    $expected_value = $field === 'noindex' ? (bool) $expected : (string) $expected;

    if ($db_value !== $expected_value || $api_value !== $expected_value) {
        return seogrow_connector_persistence_error_response(
            'seogrow_taxonomy_persistence_divergence',
            'Scrittura Rank Math non certificata: API WordPress e riga reale wp_termmeta non concordano sul valore appena scritto.',
            409,
            array(
                'dbRowCount' => count($rows),
                'apiMatches' => $api_value === $expected_value,
                'dbMatches' => $db_value === $expected_value,
            )
        );
    }

    $data['persistenceProof'] = array(
        'verified' => true,
        'source' => 'wp_termmeta+get_term_meta',
        'dbRowCount' => 1,
        'apiMatches' => true,
        'dbMatches' => true,
        'readBackRequestScoped' => true,
    );
    $rest_response->set_data($data);
    return $rest_response;
}
add_filter('rest_post_dispatch', 'seogrow_connector_rank_math_persistence_proof', 20, 3);
