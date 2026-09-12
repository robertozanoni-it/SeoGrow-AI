<?php
if (!defined('ABSPATH')) { exit; }

/**
 * Strengthens the shared-link scanner without widening its write surface.
 * A shared template may be changed only when the Connector can prove that the
 * complete published Elementor library inside the supported cap was inspected,
 * every relevant document was readable/editable by the authenticated user, and
 * the scanner result agrees with an independent pass over the same documents.
 */
function seogrow_shared_link_scan_guard($response, $server, $request) {
    unset($server);
    if (!($request instanceof WP_REST_Request) || $request->get_route() !== '/seogrow/v1/elementor-shared-link-scan') {
        return $response;
    }
    if (is_wp_error($response)) { return $response; }

    $data = $response instanceof WP_REST_Response ? $response->get_data() : $response;
    if (!is_array($data) || empty($data['ok'])) { return $response; }

    $scan_cap = 200;
    $ids = get_posts(array(
        'post_type' => 'elementor_library',
        'post_status' => 'publish',
        'fields' => 'ids',
        'posts_per_page' => $scan_cap + 1,
        'no_found_rows' => true,
        'orderby' => 'ID',
        'order' => 'DESC',
    ));
    $observed = array_values((array) $ids);
    $truncated = count($observed) > $scan_cap;
    $documents = array_slice($observed, 0, $scan_cap);
    $target = function_exists('seogrow_shared_link_target')
        ? seogrow_shared_link_target($request->get_param('targetUrl'))
        : '';

    $scanned = 0;
    $permission_denied = 0;
    $unreadable = 0;
    $supported_matches = 0;
    $unsupported_matches = 0;

    if (!$truncated && $target !== '') {
        foreach ($documents as $raw_id) {
            $id = absint($raw_id);
            if (!$id) { $unreadable += 1; continue; }
            $scanned += 1;
            if (!current_user_can('edit_post', $id)) {
                $permission_denied += 1;
                continue;
            }
            $raw = get_post_meta($id, '_elementor_data', true);
            if ($raw === '' || $raw === null) { continue; }
            if (!is_string($raw) || !function_exists('seogrow_shared_link_transform_data')) {
                $unreadable += 1;
                continue;
            }
            $probe = seogrow_shared_link_transform_data($raw, $target, 'unlink-preserve-text');
            if (!is_array($probe) || empty($probe['ok'])) {
                $unreadable += 1;
                continue;
            }
            if ((int) ($probe['count'] ?? 0) < 1) { continue; }
            $type = sanitize_key((string) get_post_meta($id, '_elementor_template_type', true));
            if (function_exists('seogrow_shared_link_allowed_types') && in_array($type, seogrow_shared_link_allowed_types(), true)) {
                $supported_matches += 1;
            } else {
                // A rendered link in an unsupported Elementor Library document
                // means ownership is not fully explained by the writable scope.
                $unsupported_matches += 1;
            }
        }
    }

    $reported_matches = (int) ($data['matchCount'] ?? 0);
    $scanner_mismatch = !$truncated && $target !== '' && $supported_matches !== $reported_matches;
    $complete = !$truncated
        && $target !== ''
        && $scanned === count($documents)
        && $permission_denied === 0
        && $unreadable === 0
        && $unsupported_matches === 0
        && !$scanner_mismatch;

    $data['scanTruncated'] = $truncated;
    $data['scanCap'] = $scan_cap;
    $data['publishedTemplatesObservedUpToCap'] = min(count($observed), $scan_cap);
    $data['scannedTemplates'] = $scanned;
    $data['permissionDeniedTemplates'] = $permission_denied;
    $data['unreadableTemplates'] = $unreadable;
    $data['unsupportedTemplateMatches'] = $unsupported_matches;
    $data['independentSupportedMatchCount'] = $supported_matches;
    $data['scannerMatchCountAgrees'] = !$scanner_mismatch;
    $data['scanComplete'] = $complete;
    $data['uniqueMatchProven'] = $complete && $reported_matches === 1;
    $data['sharedWriteAllowed'] = false;

    if (!$complete) {
        $data['ok'] = false;
        $data['code'] = 'SHARED_LINK_SCAN_INCOMPLETE';
        if ($truncated) {
            $data['error'] = 'La libreria Elementor supera il limite di scansione sicura: unicità del template non dimostrabile.';
        } elseif ($permission_denied > 0) {
            $data['error'] = 'Uno o più template Elementor non sono leggibili con le credenziali correnti: ownership non dimostrabile.';
        } elseif ($unreadable > 0) {
            $data['error'] = 'Uno o più template Elementor contengono dati non leggibili in modo deterministico: ownership non dimostrabile.';
        } elseif ($unsupported_matches > 0) {
            $data['error'] = 'Il link compare anche in un tipo di template Elementor fuori dal perimetro di scrittura sicura.';
        } elseif ($scanner_mismatch) {
            $data['error'] = 'Le due scansioni indipendenti della libreria Elementor non concordano sul template proprietario del link.';
        } else {
            $data['error'] = 'Scansione completa della libreria Elementor non attestabile.';
        }
    }

    if ($response instanceof WP_REST_Response) {
        $response->set_data($data);
        if (!$complete) { $response->set_status(409); }
        return $response;
    }
    return new WP_REST_Response($data, $complete ? 200 : 409);
}
add_filter('rest_post_dispatch', 'seogrow_shared_link_scan_guard', 20, 3);
