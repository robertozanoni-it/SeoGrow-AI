<?php

if (!defined('ABSPATH')) {
    exit;
}

function seogrow_connector_diagnostic_scalar($value) {
    if (is_array($value)) {
        return array_values(array_map(static function ($item) {
            return is_scalar($item) ? (string) $item : '';
        }, $value));
    }
    if (is_bool($value) || is_null($value)) {
        return $value;
    }
    return is_scalar($value) ? (string) $value : '';
}

function seogrow_connector_term_meta_cache_snapshot($term_id, $key) {
    $found = false;
    $cache = wp_cache_get($term_id, 'term_meta', false, $found);
    $values = array();
    if ($found && is_array($cache) && array_key_exists($key, $cache)) {
        foreach ((array) $cache[$key] as $value) {
            $values[] = seogrow_connector_diagnostic_scalar(maybe_unserialize($value));
        }
    }
    return array(
        'found' => (bool) $found,
        'values' => $values,
    );
}

function seogrow_connector_term_meta_db_rows($term_id, $key) {
    global $wpdb;
    $rows = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT meta_id, meta_value FROM {$wpdb->termmeta} WHERE term_id = %d AND meta_key = %s ORDER BY meta_id ASC",
            $term_id,
            $key
        ),
        ARRAY_A
    );
    if (!is_array($rows)) {
        return array();
    }
    return array_map(static function ($row) {
        return array(
            'metaId' => isset($row['meta_id']) ? (int) $row['meta_id'] : 0,
            'value' => seogrow_connector_diagnostic_scalar(maybe_unserialize($row['meta_value'] ?? '')),
        );
    }, $rows);
}

function seogrow_connector_taxonomy_diagnostics_read(WP_REST_Request $request) {
    $target_url = esc_url_raw((string) $request->get_param('url'));
    if (!$target_url) {
        return new WP_Error('seogrow_taxonomy_url_required', 'URL tassonomia obbligatorio.', array('status' => 400));
    }

    $term = seogrow_connector_find_exact_taxonomy_term($target_url);
    if (is_wp_error($term)) {
        return $term;
    }
    if (!current_user_can('edit_term', $term->term_id)) {
        return new WP_Error('seogrow_taxonomy_forbidden', 'Permessi insufficienti per leggere questa tassonomia.', array('status' => 403));
    }

    $link = get_term_link($term);
    if (is_wp_error($link)) {
        return $link;
    }

    $keys = array(
        'rank_math_title',
        'rank_math_description',
        'rank_math_canonical_url',
        'rank_math_robots',
    );
    $meta = array();
    foreach ($keys as $key) {
        $api_value = get_term_meta($term->term_id, $key, true);
        $db_rows = seogrow_connector_term_meta_db_rows($term->term_id, $key);
        $meta[$key] = array(
            'metadataExists' => metadata_exists('term', $term->term_id, $key),
            'apiValue' => seogrow_connector_diagnostic_scalar($api_value),
            'cache' => seogrow_connector_term_meta_cache_snapshot($term->term_id, $key),
            'dbRows' => $db_rows,
            'dbRowCount' => count($db_rows),
            'duplicateRows' => count($db_rows) > 1,
        );
    }

    $plugins = seogrow_connector_taxonomy_plugins();
    $inspection = seogrow_connector_taxonomy_inspection_payload($term);
    if (is_wp_error($inspection)) {
        return $inspection;
    }

    return rest_ensure_response(array(
        'ok' => true,
        'readOnly' => true,
        'resource' => 'taxonomy-diagnostics',
        'diagnosticsVersion' => '1.0.0',
        'writesPerformed' => 0,
        'term' => array(
            'id' => (int) $term->term_id,
            'taxonomy' => (string) $term->taxonomy,
            'slug' => (string) $term->slug,
            'name' => (string) $term->name,
            'link' => (string) $link,
        ),
        'plugins' => array(
            'rankMath' => $plugins['rankMath'] === true,
            'rankMathVersion' => defined('RANK_MATH_VERSION') ? (string) RANK_MATH_VERSION : '',
            'yoast' => $plugins['yoast'] === true,
        ),
        'inspectionRankMath' => $inspection['seo']['rankMath'] ?? null,
        'meta' => $meta,
    ));
}

add_action('rest_api_init', static function () {
    register_rest_route('seogrow/v1', '/taxonomy-diagnostics', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_taxonomy_diagnostics_read',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
    ));
});
