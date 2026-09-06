<?php

if (!defined('ABSPATH')) {
    exit;
}

const SEOGROW_TAXONOMY_PUBLIC_CACHE_PURGE_BUILD = 'litespeed-url-purge-20260906-v1';

function seogrow_connector_taxonomy_purge_public_url($term) {
    if (!$term || is_wp_error($term)) {
        return array('requested' => false, 'url' => '');
    }

    $link = get_term_link($term);
    if (is_wp_error($link) || !is_string($link) || $link === '') {
        return array('requested' => false, 'url' => '');
    }

    do_action('litespeed_purge_url', $link);

    return array(
        'requested' => true,
        'url' => $link,
        'hook' => 'litespeed_purge_url',
    );
}

function seogrow_connector_taxonomy_public_cache_purge_capability() {
    return rest_ensure_response(array(
        'ok' => true,
        'readOnly' => true,
        'resource' => 'taxonomy-public-cache-purge-capability',
        'publicCachePurge' => true,
        'hook' => 'litespeed_purge_url',
        'build' => SEOGROW_TAXONOMY_PUBLIC_CACHE_PURGE_BUILD,
        'contentWritesPerformed' => 0,
        'cacheMutationPerformed' => false,
    ));
}

function seogrow_connector_taxonomy_public_cache_purge(WP_REST_Request $request) {
    $target_url = esc_url_raw((string) $request->get_param('url'));
    if (!$target_url) {
        return new WP_Error('seogrow_taxonomy_url_required', 'URL tassonomia obbligatorio.', array('status' => 400));
    }

    $term = seogrow_connector_find_exact_taxonomy_term($target_url);
    if (is_wp_error($term)) {
        return $term;
    }
    if (!current_user_can('edit_term', $term->term_id)) {
        return new WP_Error('seogrow_taxonomy_forbidden', 'Permessi insufficienti per invalidare la cache di questa tassonomia.', array('status' => 403));
    }

    $purge = seogrow_connector_taxonomy_purge_public_url($term);
    if ($purge['requested'] !== true) {
        return new WP_Error('seogrow_taxonomy_purge_unavailable', 'Impossibile determinare la URL pubblica della tassonomia da invalidare.', array('status' => 409));
    }

    return rest_ensure_response(array(
        'ok' => true,
        'resource' => 'taxonomy-public-cache-purge',
        'contentWritesPerformed' => 0,
        'cacheMutationPerformed' => true,
        'purgeRequested' => true,
        'hook' => $purge['hook'],
        'build' => SEOGROW_TAXONOMY_PUBLIC_CACHE_PURGE_BUILD,
        'url' => $purge['url'],
        'term' => array(
            'id' => (int) $term->term_id,
            'taxonomy' => (string) $term->taxonomy,
        ),
    ));
}

function seogrow_connector_taxonomy_rankmath_meta_cache_purge($meta_id, $object_id, $meta_key) {
    $keys = array('rank_math_title', 'rank_math_description', 'rank_math_canonical_url', 'rank_math_robots');
    if (!in_array((string) $meta_key, $keys, true)) {
        return;
    }

    $term = get_term(absint($object_id));
    if (!$term || is_wp_error($term)) {
        return;
    }

    seogrow_connector_taxonomy_purge_public_url($term);
}

add_action('added_term_meta', 'seogrow_connector_taxonomy_rankmath_meta_cache_purge', 10, 3);
add_action('updated_term_meta', 'seogrow_connector_taxonomy_rankmath_meta_cache_purge', 10, 3);
add_action('deleted_term_meta', 'seogrow_connector_taxonomy_rankmath_meta_cache_purge', 10, 3);

add_action('rest_api_init', static function () {
    register_rest_route('seogrow/v1', '/taxonomy-public-cache-purge-capability', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_taxonomy_public_cache_purge_capability',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
    ));

    register_rest_route('seogrow/v1', '/taxonomy-public-cache-purge', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'seogrow_connector_taxonomy_public_cache_purge',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
        'args' => array(
            'url' => array(
                'required' => true,
                'type' => 'string',
            ),
        ),
    ));
});
