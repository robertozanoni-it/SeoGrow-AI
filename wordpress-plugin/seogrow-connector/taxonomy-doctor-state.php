<?php

if (!defined('ABSPATH')) {
    exit;
}

const SEOGROW_TAXONOMY_DOCTOR_CAPABILITY = 'rankmath-doctor-20260906-v1';
const SEOGROW_TAXONOMY_DOCTOR_LKG_TTL = 2592000; // 30 giorni

function seogrow_connector_taxonomy_doctor_lkg_key($term_id, $taxonomy, $field) {
    return 'seogrow_taxonomy_lkg_' . md5((int) $term_id . '|' . (string) $taxonomy . '|' . (string) $field);
}

function seogrow_connector_taxonomy_doctor_capability() {
    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-doctor-capability',
        'capability' => SEOGROW_TAXONOMY_DOCTOR_CAPABILITY,
        'readOnly' => true,
        'contentWritesPerformed' => 0,
        'supportsLastKnownGood' => true,
        'supportsRecoveryJournal' => defined('SEOGROW_TAXONOMY_RECOVERY_CAPABILITY'),
        'supportsTargetedPublicCachePurge' => defined('SEOGROW_TAXONOMY_PUBLIC_CACHE_PURGE_CAPABILITY'),
        'supportsObjectCacheRefresh' => true,
        'supportsIdenticalDuplicateCollapse' => true,
        'realSeoMarkerWritesAllowed' => false,
    ));
}

function seogrow_connector_taxonomy_doctor_term($url, $term_id, $taxonomy) {
    if (!$url || !$term_id || !in_array($taxonomy, array('category', 'post_tag'), true)) {
        return new WP_Error('seogrow_doctor_identity_required', 'Identità tassonomia Doctor incompleta.', array('status' => 400));
    }
    $plugins = seogrow_connector_taxonomy_plugins();
    if (!$plugins['rankMath'] || $plugins['yoast']) {
        return new WP_Error('seogrow_doctor_ownership_lost', 'Doctor bloccato: Rank Math non è il solo proprietario SEO.', array('status' => 409));
    }
    $term = seogrow_connector_find_exact_taxonomy_term($url);
    if (is_wp_error($term)) return $term;
    if ((int) $term->term_id !== (int) $term_id || (string) $term->taxonomy !== (string) $taxonomy) {
        return new WP_Error('seogrow_doctor_identity_changed', 'La tassonomia non coincide con l’identità Doctor richiesta.', array('status' => 409));
    }
    if (!current_user_can('edit_term', $term->term_id)) {
        return new WP_Error('seogrow_doctor_forbidden', 'Permessi insufficienti per il Doctor tassonomia.', array('status' => 403));
    }
    return $term;
}

function seogrow_connector_taxonomy_doctor_current_rank_math_description($term) {
    global $wpdb;
    $rows = $wpdb->get_col($wpdb->prepare(
        "SELECT meta_value FROM {$wpdb->termmeta} WHERE term_id = %d AND meta_key = %s ORDER BY meta_id ASC",
        (int) $term->term_id,
        'rank_math_description'
    ));
    $rows = is_array($rows) ? array_values(array_map('strval', $rows)) : array();
    return array(
        'api' => (string) get_term_meta($term->term_id, 'rank_math_description', true),
        'rows' => $rows,
        'singleRow' => count($rows) === 1,
        'db' => count($rows) === 1 ? (string) $rows[0] : null,
    );
}

function seogrow_connector_taxonomy_doctor_observe(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $adapter = sanitize_key((string) $request->get_param('adapter'));
    $field = sanitize_key((string) $request->get_param('field'));
    $expected_current = wp_check_invalid_utf8((string) $request->get_param('expectedCurrent'));

    if ($adapter !== 'rank-math' || $field !== 'meta_description') {
        return new WP_Error('seogrow_doctor_scope_invalid', 'Il Last-Known-Good Doctor è limitato a Rank Math meta_description.', array('status' => 400));
    }
    if (trim($expected_current) === '' || seogrow_connector_taxonomy_recovery_marker_valid($expected_current)) {
        return new WP_Error('seogrow_doctor_lkg_invalid', 'Un marker E2E o un valore vuoto non può diventare Last-Known-Good.', array('status' => 409));
    }

    $term = seogrow_connector_taxonomy_doctor_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;
    $state = seogrow_connector_taxonomy_doctor_current_rank_math_description($term);
    if (!$state['singleRow'] || $state['api'] !== $expected_current || $state['db'] !== $expected_current) {
        return new WP_Error('seogrow_doctor_lkg_stale', 'Last-Known-Good non registrato: API e database non coincidono esattamente col valore osservato.', array('status' => 409));
    }

    $record = array(
        'capability' => SEOGROW_TAXONOMY_DOCTOR_CAPABILITY,
        'url' => $url,
        'termId' => (int) $term->term_id,
        'taxonomy' => (string) $term->taxonomy,
        'adapter' => 'rank-math',
        'field' => 'meta_description',
        'value' => $expected_current,
        'sha256' => hash('sha256', $expected_current),
        'observedAt' => time(),
        'expiresAt' => time() + SEOGROW_TAXONOMY_DOCTOR_LKG_TTL,
    );
    update_option(seogrow_connector_taxonomy_doctor_lkg_key($term->term_id, $term->taxonomy, $field), $record, false);

    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-doctor-last-known-good',
        'recorded' => true,
        'contentWritesPerformed' => 0,
        'journalWritesPerformed' => 1,
        'sha256' => $record['sha256'],
        'expiresAt' => $record['expiresAt'],
    ));
}

function seogrow_connector_taxonomy_doctor_state(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $term = seogrow_connector_taxonomy_doctor_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;

    $current = seogrow_connector_taxonomy_doctor_current_rank_math_description($term);
    $key = seogrow_connector_taxonomy_doctor_lkg_key($term->term_id, $term->taxonomy, 'meta_description');
    $lkg = get_option($key, null);
    if (!is_array($lkg) || empty($lkg['expiresAt']) || (int) $lkg['expiresAt'] < time()) {
        $lkg = null;
    }

    $journal_key = seogrow_connector_taxonomy_recovery_key($term->term_id, $term->taxonomy, 'meta_description');
    $journal = get_option($journal_key, null);
    if (!is_array($journal) || (empty($journal['convergencePending']) && (empty($journal['expiresAt']) || (int) $journal['expiresAt'] < time()))) {
        $journal = null;
    }

    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-doctor-state',
        'readOnly' => true,
        'contentWritesPerformed' => 0,
        'term' => array(
            'id' => (int) $term->term_id,
            'taxonomy' => (string) $term->taxonomy,
            'slug' => (string) $term->slug,
        ),
        'current' => array(
            'api' => $current['api'],
            'db' => $current['db'],
            'dbRows' => $current['rows'],
            'dbRowCount' => count($current['rows']),
            'singleRow' => $current['singleRow'],
            'isMarker' => seogrow_connector_taxonomy_recovery_marker_valid($current['api']),
        ),
        'lastKnownGood' => $lkg ? array(
            'available' => true,
            'value' => (string) ($lkg['value'] ?? ''),
            'sha256' => (string) ($lkg['sha256'] ?? ''),
            'observedAt' => (int) ($lkg['observedAt'] ?? 0),
            'expiresAt' => (int) ($lkg['expiresAt'] ?? 0),
        ) : array('available' => false),
        'recoveryJournal' => $journal ? array(
            'available' => true,
            'original' => (string) ($journal['original'] ?? ''),
            'marker' => (string) ($journal['marker'] ?? ''),
            'expiresAt' => (int) ($journal['expiresAt'] ?? 0),
        ) : array('available' => false),
    ));
}

function seogrow_connector_taxonomy_doctor_refresh_cache(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $term = seogrow_connector_taxonomy_doctor_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;
    clean_term_cache($term->term_id, $term->taxonomy);
    if (has_action('litespeed_purge_url')) {
        do_action('litespeed_purge_url', $url);
    }
    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-doctor-cache-refresh',
        'contentWritesPerformed' => 0,
        'objectCacheCleared' => true,
        'publicCachePurgeRequested' => has_action('litespeed_purge_url') ? true : false,
    ));
}

function seogrow_connector_taxonomy_doctor_dedupe(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $expected = wp_check_invalid_utf8((string) $request->get_param('expectedValue'));
    $confirm = (string) $request->get_param('confirm');
    if ($confirm !== 'YES_I_UNDERSTAND') {
        return new WP_Error('seogrow_doctor_confirmation_required', 'Dedupe non autorizzato senza conferma esplicita.', array('status' => 400));
    }
    $term = seogrow_connector_taxonomy_doctor_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;
    $state = seogrow_connector_taxonomy_doctor_current_rank_math_description($term);
    if (count($state['rows']) <= 1) {
        return new WP_Error('seogrow_doctor_dedupe_not_needed', 'Nessuna riga duplicata da correggere.', array('status' => 409));
    }
    foreach ($state['rows'] as $row) {
        if ($row !== $expected) {
            return new WP_Error('seogrow_doctor_dedupe_ambiguous', 'Dedupe bloccato: le righe duplicate non contengono tutte lo stesso valore atteso.', array('status' => 409));
        }
    }
    if ($state['api'] !== $expected) {
        return new WP_Error('seogrow_doctor_dedupe_stale', 'Dedupe bloccato: get_term_meta non coincide col valore duplicato atteso.', array('status' => 409));
    }

    delete_term_meta($term->term_id, 'rank_math_description');
    $added = add_term_meta($term->term_id, 'rank_math_description', $expected, true);
    if (!$added) {
        return new WP_Error('seogrow_doctor_dedupe_write_failed', 'Impossibile ricreare una singola riga rank_math_description.', array('status' => 500));
    }
    clean_term_cache($term->term_id, $term->taxonomy);
    $after = seogrow_connector_taxonomy_doctor_current_rank_math_description($term);
    if (!$after['singleRow'] || $after['api'] !== $expected || $after['db'] !== $expected) {
        return new WP_Error('seogrow_doctor_dedupe_unverified', 'Dedupe eseguito ma stato finale non verificato.', array('status' => 500));
    }
    if (has_action('litespeed_purge_url')) {
        do_action('litespeed_purge_url', $url);
    }
    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-doctor-dedupe',
        'repaired' => true,
        'staleChecked' => true,
        'contentWritesPerformed' => 1,
        'beforeRowCount' => count($state['rows']),
        'afterRowCount' => 1,
        'valuePreserved' => true,
    ));
}

add_action('rest_api_init', static function () {
    $permission = static function () {
        return current_user_can('edit_posts') || current_user_can('manage_categories');
    };
    register_rest_route('seogrow/v1', '/taxonomy-doctor-capability', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_taxonomy_doctor_capability',
        'permission_callback' => $permission,
    ));
    register_rest_route('seogrow/v1', '/taxonomy-doctor-observe', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_doctor_observe',
        'permission_callback' => $permission,
    ));
    register_rest_route('seogrow/v1', '/taxonomy-doctor-state', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_taxonomy_doctor_state',
        'permission_callback' => $permission,
        'args' => array(
            'url' => array('required' => true, 'type' => 'string', 'sanitize_callback' => 'esc_url_raw'),
            'termId' => array('required' => true, 'type' => 'integer'),
            'taxonomy' => array('required' => true, 'type' => 'string', 'sanitize_callback' => 'sanitize_key'),
        ),
    ));
    register_rest_route('seogrow/v1', '/taxonomy-doctor-refresh-cache', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_doctor_refresh_cache',
        'permission_callback' => $permission,
    ));
    register_rest_route('seogrow/v1', '/taxonomy-doctor-dedupe', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_doctor_dedupe',
        'permission_callback' => $permission,
    ));
});
