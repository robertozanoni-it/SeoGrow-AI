<?php

if (!defined('ABSPATH')) {
    exit;
}

const SEOGROW_TAXONOMY_CACHE_COHERENCE_BUILD = 'cache-coherent-20260906-v1';

function seogrow_connector_taxonomy_cache_coherence_capability() {
    return rest_ensure_response(array(
        'ok' => true,
        'readOnly' => true,
        'resource' => 'taxonomy-cache-coherence-capability',
        'crossRequestCacheCoherence' => true,
        'build' => SEOGROW_TAXONOMY_CACHE_COHERENCE_BUILD,
        'writesPerformed' => 0,
    ));
}

add_action('rest_api_init', static function () {
    register_rest_route('seogrow/v1', '/taxonomy-cache-coherence-capability', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_taxonomy_cache_coherence_capability',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
    ));
});
