<?php
if (!defined('ABSPATH')) { exit; }

/**
 * The shared-link scanner intentionally reads at most 200 published
 * elementor_library documents. A unique hit is not proof of uniqueness when
 * the library is larger than that cap, so annotate the response and let the
 * SeoGrow server refuse shared writes in that case.
 */
function seogrow_shared_link_scan_guard($response, $server, $request) {
    unset($server);
    if (!($request instanceof WP_REST_Request) || $request->get_route() !== '/seogrow/v1/elementor-shared-link-scan') {
        return $response;
    }
    if (is_wp_error($response)) { return $response; }

    $data = $response instanceof WP_REST_Response ? $response->get_data() : $response;
    if (!is_array($data) || empty($data['ok'])) { return $response; }

    $ids = get_posts(array(
        'post_type' => 'elementor_library',
        'post_status' => 'publish',
        'fields' => 'ids',
        'posts_per_page' => 201,
        'no_found_rows' => true,
        'orderby' => 'ID',
        'order' => 'DESC',
    ));
    $count = count((array) $ids);
    $truncated = $count > 200;
    $data['scanTruncated'] = $truncated;
    $data['scanCap'] = 200;
    $data['publishedTemplatesObservedUpToCap'] = min($count, 200);
    $data['uniqueMatchProven'] = !$truncated && (int) ($data['matchCount'] ?? 0) === 1;
    $data['sharedWriteAllowed'] = false;

    if ($response instanceof WP_REST_Response) {
        $response->set_data($data);
        return $response;
    }
    return rest_ensure_response($data);
}
add_filter('rest_post_dispatch', 'seogrow_shared_link_scan_guard', 20, 3);
