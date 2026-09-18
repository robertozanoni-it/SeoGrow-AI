<?php

if (!defined('ABSPATH')) {
    exit;
}

const SEOGROW_TAXONOMY_RECOVERY_CAPABILITY = 'taxonomy-recovery-journal-20260906-v1';
const SEOGROW_TAXONOMY_RECOVERY_TTL = 21600;

function seogrow_connector_taxonomy_recovery_key($term_id, $taxonomy, $field) {
    return 'seogrow_taxonomy_recovery_' . md5((int) $term_id . '|' . (string) $taxonomy . '|' . (string) $field);
}

function seogrow_connector_taxonomy_recovery_marker_valid($marker) {
    return (bool) preg_match('/^SeoGrow E2E (categoria|tag) \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/', (string) $marker);
}

function seogrow_connector_taxonomy_recovery_term($url, $term_id, $taxonomy) {
    if (!$url || !$term_id || !in_array($taxonomy, array('category', 'post_tag'), true)) {
        return new WP_Error('seogrow_recovery_identity_required', 'Identità tassonomia recovery incompleta.', array('status' => 400));
    }
    $term = seogrow_connector_find_exact_taxonomy_term($url);
    if (is_wp_error($term)) {
        return $term;
    }
    if ((int) $term->term_id !== (int) $term_id || (string) $term->taxonomy !== (string) $taxonomy) {
        return new WP_Error('seogrow_recovery_identity_changed', 'La tassonomia non coincide con l’identità recovery richiesta.', array('status' => 409));
    }
    if (!current_user_can('edit_term', $term->term_id)) {
        return new WP_Error('seogrow_recovery_forbidden', 'Permessi insufficienti per il recovery tassonomia.', array('status' => 403));
    }
    return $term;
}

function seogrow_connector_taxonomy_recovery_db_value($term_id) {
    global $wpdb;
    $rows = $wpdb->get_col($wpdb->prepare(
        "SELECT meta_value FROM {$wpdb->termmeta} WHERE term_id = %d AND meta_key = %s ORDER BY meta_id ASC",
        (int) $term_id,
        'rank_math_description'
    ));
    return is_array($rows) ? array_values(array_map('strval', $rows)) : array();
}

function seogrow_connector_taxonomy_recovery_current($term) {
    $api = (string) get_term_meta($term->term_id, 'rank_math_description', true);
    $rows = seogrow_connector_taxonomy_recovery_db_value($term->term_id);
    return array(
        'api' => $api,
        'rows' => $rows,
        'singleRow' => count($rows) === 1,
        'db' => count($rows) === 1 ? (string) $rows[0] : null,
    );
}

function seogrow_connector_taxonomy_recovery_capability() {
    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-recovery-journal-capability',
        'capability' => SEOGROW_TAXONOMY_RECOVERY_CAPABILITY,
        'readOnly' => true,
        'contentWritesPerformed' => 0,
        'journalWritesPerformed' => 0,
        'staleSafe' => true,
        'supportsBootstrapRecovery' => true,
    ));
}

function seogrow_connector_taxonomy_recovery_arm(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $field = sanitize_key((string) $request->get_param('field'));
    $adapter = sanitize_key((string) $request->get_param('adapter'));
    $original = wp_check_invalid_utf8((string) $request->get_param('original'));
    $marker = wp_check_invalid_utf8((string) $request->get_param('marker'));

    if ($adapter !== 'rank-math' || $field !== 'meta_description') {
        return new WP_Error('seogrow_recovery_scope_invalid', 'Il recovery journal è limitato a Rank Math meta_description.', array('status' => 400));
    }
    if (!seogrow_connector_taxonomy_recovery_marker_valid($marker) || trim($original) === '') {
        return new WP_Error('seogrow_recovery_values_invalid', 'Marker o valore originale recovery non validi.', array('status' => 400));
    }
    $term = seogrow_connector_taxonomy_recovery_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;

    $state = seogrow_connector_taxonomy_recovery_current($term);
    if (!$state['singleRow'] || $state['api'] !== $original || $state['db'] !== $original) {
        return new WP_Error('seogrow_recovery_arm_stale', 'Recovery journal non armato: il valore corrente non coincide esattamente con l’originale.', array('status' => 409));
    }

    $key = seogrow_connector_taxonomy_recovery_key($term->term_id, $term->taxonomy, $field);
    $existing = get_option($key, null);
    if (is_array($existing) && !empty($existing['expiresAt']) && (int) $existing['expiresAt'] >= time()) {
        if ((string) ($existing['marker'] ?? '') !== $marker || (string) ($existing['original'] ?? '') !== $original) {
            return new WP_Error('seogrow_recovery_already_armed', 'Esiste già un recovery journal attivo differente.', array('status' => 409));
        }
    }

    $journal = array(
        'capability' => SEOGROW_TAXONOMY_RECOVERY_CAPABILITY,
        'url' => $url,
        'termId' => (int) $term->term_id,
        'taxonomy' => (string) $term->taxonomy,
        'adapter' => 'rank-math',
        'field' => 'meta_description',
        'original' => $original,
        'marker' => $marker,
        'createdAt' => time(),
        'expiresAt' => time() + SEOGROW_TAXONOMY_RECOVERY_TTL,
    );
    update_option($key, $journal, false);

    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-recovery-journal',
        'armed' => true,
        'capability' => SEOGROW_TAXONOMY_RECOVERY_CAPABILITY,
        'contentWritesPerformed' => 0,
        'journalWritesPerformed' => 1,
        'expiresAt' => $journal['expiresAt'],
    ));
}

function seogrow_connector_taxonomy_recovery_execute(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $expected_marker = wp_check_invalid_utf8((string) $request->get_param('expectedMarker'));
    $confirm = (string) $request->get_param('confirm');
    $bootstrap_original = wp_check_invalid_utf8((string) $request->get_param('bootstrapOriginal'));

    if ($confirm !== 'YES_I_UNDERSTAND') {
        return new WP_Error('seogrow_recovery_confirmation_required', 'Recovery non autorizzato senza conferma esplicita.', array('status' => 400));
    }
    if (!seogrow_connector_taxonomy_recovery_marker_valid($expected_marker)) {
        return new WP_Error('seogrow_recovery_marker_invalid', 'Il valore corrente non è un marker SeoGrow E2E valido.', array('status' => 409));
    }

    $term = seogrow_connector_taxonomy_recovery_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;
    $key = seogrow_connector_taxonomy_recovery_key($term->term_id, $term->taxonomy, 'meta_description');
    $journal = get_option($key, null);

    if (!is_array($journal) || empty($journal['expiresAt']) || (int) $journal['expiresAt'] < time()) {
        if (trim($bootstrap_original) === '') {
            return new WP_Error('seogrow_recovery_journal_missing', 'Nessun recovery journal valido disponibile; serve il valore originale esplicito per il bootstrap una tantum.', array('status' => 409));
        }
        $journal = array(
            'capability' => SEOGROW_TAXONOMY_RECOVERY_CAPABILITY,
            'url' => $url,
            'termId' => (int) $term->term_id,
            'taxonomy' => (string) $term->taxonomy,
            'adapter' => 'rank-math',
            'field' => 'meta_description',
            'original' => $bootstrap_original,
            'marker' => $expected_marker,
            'createdAt' => time(),
            'expiresAt' => time() + SEOGROW_TAXONOMY_RECOVERY_TTL,
            'bootstrap' => true,
        );
    }

    if (
        (int) ($journal['termId'] ?? 0) !== (int) $term->term_id ||
        (string) ($journal['taxonomy'] ?? '') !== (string) $term->taxonomy ||
        (string) ($journal['adapter'] ?? '') !== 'rank-math' ||
        (string) ($journal['field'] ?? '') !== 'meta_description' ||
        (string) ($journal['marker'] ?? '') !== $expected_marker ||
        trim((string) ($journal['original'] ?? '')) === ''
    ) {
        return new WP_Error('seogrow_recovery_journal_mismatch', 'Recovery journal non coerente con la risorsa o con il marker corrente.', array('status' => 409));
    }

    $state = seogrow_connector_taxonomy_recovery_current($term);
    if (!$state['singleRow'] || $state['api'] !== $expected_marker || $state['db'] !== $expected_marker) {
        return new WP_Error('seogrow_recovery_stale', 'Recovery bloccato: API e database non coincidono più esattamente con il marker atteso.', array('status' => 409));
    }

    $original = (string) $journal['original'];
    $written = update_term_meta($term->term_id, 'rank_math_description', $original);
    if ($written === false) {
        return new WP_Error('seogrow_recovery_write_failed', 'Ripristino Rank Math non riuscito.', array('status' => 500));
    }
    clean_term_cache($term->term_id, $term->taxonomy);
    $after = seogrow_connector_taxonomy_recovery_current($term);
    if (!$after['singleRow'] || $after['api'] !== $original || $after['db'] !== $original) {
        return new WP_Error('seogrow_recovery_persistence_unverified', 'Ripristino eseguito ma persistence proof non coerente.', array('status' => 500));
    }

    if (has_action('litespeed_purge_url')) {
        do_action('litespeed_purge_url', $url);
    }
    delete_option($key);

    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-recovery-journal',
        'recovered' => true,
        'staleChecked' => true,
        'singleField' => true,
        'adapter' => 'rank-math',
        'field' => 'meta_description',
        'before' => $expected_marker,
        'after' => $original,
        'contentWritesPerformed' => 1,
        'journalCleared' => true,
        'cachePurgeRequested' => has_action('litespeed_purge_url') ? true : false,
    ));
}

function seogrow_connector_taxonomy_recovery_clear(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $expected_original = wp_check_invalid_utf8((string) $request->get_param('expectedOriginal'));
    $term = seogrow_connector_taxonomy_recovery_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;
    $state = seogrow_connector_taxonomy_recovery_current($term);
    if (!$state['singleRow'] || $state['api'] !== $expected_original || $state['db'] !== $expected_original) {
        return new WP_Error('seogrow_recovery_clear_stale', 'Journal non cancellato: il valore corrente non coincide con l’originale atteso.', array('status' => 409));
    }
    $key = seogrow_connector_taxonomy_recovery_key($term->term_id, $term->taxonomy, 'meta_description');
    delete_option($key);
    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-recovery-journal',
        'cleared' => true,
        'contentWritesPerformed' => 0,
    ));
}

add_action('rest_api_init', static function () {
    $permission = static function () {
        return current_user_can('edit_posts') || current_user_can('manage_categories');
    };

    register_rest_route('seogrow/v1', '/taxonomy-recovery-capability', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_taxonomy_recovery_capability',
        'permission_callback' => $permission,
    ));
    register_rest_route('seogrow/v1', '/taxonomy-recovery-arm', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_recovery_arm',
        'permission_callback' => $permission,
    ));
    register_rest_route('seogrow/v1', '/taxonomy-recovery-execute', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_recovery_execute',
        'permission_callback' => $permission,
    ));
    register_rest_route('seogrow/v1', '/taxonomy-recovery-clear', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_recovery_clear',
        'permission_callback' => $permission,
    ));
});
