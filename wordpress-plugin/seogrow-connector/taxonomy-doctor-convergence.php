<?php

if (!defined('ABSPATH')) {
    exit;
}

const SEOGROW_TAXONOMY_DOCTOR_CONVERGENCE_CAPABILITY = 'rankmath-doctor-convergence-20260906-v2';

function seogrow_connector_taxonomy_doctor_convergence_capability() {
    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-doctor-convergence-capability',
        'capability' => SEOGROW_TAXONOMY_DOCTOR_CONVERGENCE_CAPABILITY,
        'readOnly' => true,
        'contentWritesPerformed' => 0,
        'journalRetainedUntilCrossRequestProof' => true,
        'supportsTwoPhaseRecovery' => true,
        'safetyRevision' => 'journal-hooks-20260906-v3',
        'connectorVersion' => SEOGROW_CONNECTOR_VERSION,
        'realSeoMarkerWritesAllowed' => false,
    ));
}

function seogrow_connector_taxonomy_doctor_recovery_source($term, $expected_marker, $bootstrap_original) {
    $journal_key = seogrow_connector_taxonomy_recovery_key($term->term_id, $term->taxonomy, 'meta_description');
    $journal = get_option($journal_key, null);
    if (is_array($journal) && (!empty($journal['convergencePending']) || (!empty($journal['expiresAt']) && (int) $journal['expiresAt'] >= time()))) {
        if ((string) ($journal['marker'] ?? '') === (string) $expected_marker && trim((string) ($journal['original'] ?? '')) !== '') {
            return array('source' => 'RECOVERY_JOURNAL', 'original' => (string) $journal['original'], 'key' => $journal_key, 'journal' => $journal);
        }
    }

    if (is_array($journal) && !empty($journal['convergencePending'])) {
        return new WP_Error('RECOVERY_OWNERSHIP_LOST', 'Journal pendente non coincide col marker: nessun fallback o reset dei tentativi.', array('status' => 409));
    }

    $lkg_key = seogrow_connector_taxonomy_doctor_lkg_key($term->term_id, $term->taxonomy, 'meta_description');
    $lkg = get_option($lkg_key, null);
    if (is_array($lkg) && !empty($lkg['expiresAt']) && (int) $lkg['expiresAt'] >= time()) {
        $value = (string) ($lkg['value'] ?? '');
        if (trim($value) !== '' && !seogrow_connector_taxonomy_recovery_marker_valid($value)) {
            return array('source' => 'LAST_KNOWN_GOOD', 'original' => $value, 'key' => $journal_key, 'journal' => null);
        }
    }

    if (trim((string) $bootstrap_original) !== '' && !seogrow_connector_taxonomy_recovery_marker_valid($bootstrap_original)) {
        return array('source' => 'LEGACY_BOOTSTRAP_INPUT', 'original' => (string) $bootstrap_original, 'key' => $journal_key, 'journal' => null);
    }

    return new WP_Error('seogrow_doctor_recovery_source_missing', 'Nessuna sorgente recovery deterministica disponibile.', array('status' => 409));
}

function seogrow_connector_taxonomy_doctor_recover_v2(WP_REST_Request $request) {
    $key = seogrow_connector_taxonomy_recovery_key(absint($request->get_param('termId')), sanitize_key((string) $request->get_param('taxonomy')), 'meta_description') . '_lock';
    // add_option is an atomic reservation through the unique option_name index.
    // A crashed request leaves a visible fail-closed lock; never steal it on timeout.
    if (!add_option($key, time(), '', false)) {
        return new WP_Error('RECOVERY_BUSY_OR_INTERRUPTED', 'Recovery già attivo o interrotto: verificare il journal prima di rimuovere il lock.', array('status' => 409));
    }
    try {
        return seogrow_connector_taxonomy_doctor_recover_v2_locked($request);
    } finally {
        delete_option($key);
    }
}

function seogrow_connector_taxonomy_doctor_recover_v2_locked(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $expected_marker = wp_check_invalid_utf8((string) $request->get_param('expectedMarker'));
    $bootstrap_original = wp_check_invalid_utf8((string) $request->get_param('bootstrapOriginal'));
    $confirm = (string) $request->get_param('confirm');

    if ($confirm !== 'YES_I_UNDERSTAND') {
        return new WP_Error('seogrow_doctor_confirmation_required', 'Recovery non autorizzato senza conferma esplicita.', array('status' => 400));
    }
    if (!seogrow_connector_taxonomy_recovery_marker_valid($expected_marker)) {
        return new WP_Error('seogrow_doctor_marker_invalid', 'Il valore atteso non è un marker SeoGrow E2E valido.', array('status' => 409));
    }

    $term = seogrow_connector_taxonomy_doctor_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;
    $state = seogrow_connector_taxonomy_doctor_current_rank_math_description($term);
    if (!$state['singleRow'] || $state['api'] !== $expected_marker || $state['db'] !== $expected_marker) {
        return new WP_Error('seogrow_doctor_recovery_stale', 'Recovery bloccato: API e database non coincidono esattamente col marker atteso.', array('status' => 409));
    }

    $resolved = seogrow_connector_taxonomy_doctor_recovery_source($term, $expected_marker, $bootstrap_original);
    if (is_wp_error($resolved)) return $resolved;
    $original = (string) $resolved['original'];
    $journal_key = (string) $resolved['key'];

    $attempts = is_array($resolved['journal']) ? (int) ($resolved['journal']['recoveryAttempts'] ?? 0) : 0;
    if ($attempts >= 2) {
        return new WP_Error('RECOVERY_REVERT_LOOP_DETECTED', 'Due recovery già tentati: journal conservato, richiesta analisi della causa.', array('status' => 409));
    }
    $journal = array(
        'capability' => SEOGROW_TAXONOMY_RECOVERY_CAPABILITY,
        'url' => $url,
        'termId' => (int) $term->term_id,
        'taxonomy' => (string) $term->taxonomy,
        'adapter' => 'rank-math',
        'field' => 'meta_description',
        'original' => $original,
        'marker' => $expected_marker,
        'createdAt' => is_array($resolved['journal']) ? (int) ($resolved['journal']['createdAt'] ?? time()) : time(),
        'expiresAt' => time() + SEOGROW_TAXONOMY_RECOVERY_TTL,
        'convergencePending' => true,
        'recoveryAttempts' => $attempts + 1,
        'recoverySource' => (string) $resolved['source'],
    );
    update_option($journal_key, $journal, false);
    if (get_option($journal_key, null) !== $journal) {
        return new WP_Error('seogrow_doctor_journal_not_persisted', 'Recovery bloccato: journal non persistito.', array('status' => 500));
    }

    $written = update_term_meta($term->term_id, 'rank_math_description', $original, $expected_marker);
    if ($written === false) {
        return new WP_Error('seogrow_doctor_recovery_write_failed', 'Recovery Rank Math non riuscito.', array('status' => 500));
    }
    clean_term_cache($term->term_id, $term->taxonomy);
    $after = seogrow_connector_taxonomy_doctor_current_rank_math_description($term);
    if (!$after['singleRow'] || $after['api'] !== $original || $after['db'] !== $original) {
        return new WP_Error('seogrow_doctor_recovery_same_request_unverified', 'Recovery scritto ma non verificato nella stessa richiesta.', array('status' => 500));
    }
    if (has_action('litespeed_purge_url')) {
        do_action('litespeed_purge_url', $url);
    }

    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-doctor-recover-v2',
        'recovered' => true,
        'recoverySource' => (string) $resolved['source'],
        'expectedOriginal' => $original,
        'journalRetained' => true,
        'requiresCrossRequestFinalization' => true,
        'contentWritesPerformed' => 1,
        'cachePurgeRequested' => has_action('litespeed_purge_url') ? true : false,
    ));
}

function seogrow_connector_taxonomy_doctor_finalize_recovery(WP_REST_Request $request) {
    $key = seogrow_connector_taxonomy_recovery_key(absint($request->get_param('termId')), sanitize_key((string) $request->get_param('taxonomy')), 'meta_description') . '_lock';
    // add_option is an atomic reservation through the unique option_name index.
    // A crashed request leaves a visible fail-closed lock; never steal it on timeout.
    if (!add_option($key, time(), '', false)) {
        return new WP_Error('RECOVERY_BUSY_OR_INTERRUPTED', 'Recovery già attivo o interrotto: verificare il journal prima di rimuovere il lock.', array('status' => 409));
    }
    try {
        return seogrow_connector_taxonomy_doctor_finalize_recovery_locked($request);
    } finally {
        delete_option($key);
    }
}

function seogrow_connector_taxonomy_doctor_finalize_recovery_locked(WP_REST_Request $request) {
    $url = esc_url_raw((string) $request->get_param('url'));
    $term_id = absint($request->get_param('termId'));
    $taxonomy = sanitize_key((string) $request->get_param('taxonomy'));
    $expected_original = wp_check_invalid_utf8((string) $request->get_param('expectedOriginal'));
    $confirm = (string) $request->get_param('confirm');
    if ($confirm !== 'YES_I_UNDERSTAND') {
        return new WP_Error('seogrow_doctor_confirmation_required', 'Finalizzazione recovery non autorizzata.', array('status' => 400));
    }
    $term = seogrow_connector_taxonomy_doctor_term($url, $term_id, $taxonomy);
    if (is_wp_error($term)) return $term;
    $state = seogrow_connector_taxonomy_doctor_current_rank_math_description($term);
    if (!$state['singleRow'] || $state['api'] !== $expected_original || $state['db'] !== $expected_original) {
        return new WP_Error('seogrow_doctor_finalize_stale', 'Journal non finalizzato: backend non coincide esattamente col valore originale atteso.', array('status' => 409));
    }
    $key = seogrow_connector_taxonomy_recovery_key($term->term_id, $term->taxonomy, 'meta_description');
    $journal = get_option($key, null);
    if (!is_array($journal) || (string) ($journal['original'] ?? '') !== $expected_original) {
        return new WP_Error('seogrow_doctor_finalize_journal_missing', 'Journal recovery assente o non coerente con il valore atteso.', array('status' => 409));
    }
    delete_option($key);
    if (get_option($key, null) !== null) {
        return new WP_Error('seogrow_doctor_finalize_not_cleared', 'Journal non eliminato: finalizzazione non attestata.', array('status' => 500));
    }
    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-doctor-finalize-recovery',
        'finalized' => true,
        'journalCleared' => true,
        'contentWritesPerformed' => 0,
    ));
}

add_action('rest_api_init', static function () {
    $permission = static function () {
        return current_user_can('edit_posts') || current_user_can('manage_categories');
    };
    register_rest_route('seogrow/v1', '/taxonomy-doctor-convergence-capability', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_taxonomy_doctor_convergence_capability',
        'permission_callback' => $permission,
    ));
    register_rest_route('seogrow/v1', '/taxonomy-doctor-recover-v2', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_doctor_recover_v2',
        'permission_callback' => $permission,
    ));
    register_rest_route('seogrow/v1', '/taxonomy-doctor-finalize-recovery', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_doctor_finalize_recovery',
        'permission_callback' => $permission,
    ));
});
