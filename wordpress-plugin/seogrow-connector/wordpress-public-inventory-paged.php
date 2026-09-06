<?php

if (!defined('ABSPATH')) {
    exit;
}

const SEOGROW_CONNECTOR_INVENTORY_PAGE_SIZE = 100;
const SEOGROW_CONNECTOR_INVENTORY_MAX_RESOURCES = 2000;

function seogrow_connector_wordpress_public_inventory_paged() {
    $post_types = seogrow_connector_public_queryable_post_types();
    if (!$post_types) {
        return rest_ensure_response(array(
            'ok' => true,
            'source' => 'seogrow-connector',
            'connectorVersion' => SEOGROW_CONNECTOR_VERSION,
            'inventoryScope' => 'all-public-queryable-post-types',
            'readOnly' => true,
            'complete' => false,
            'truncated' => false,
            'totalResources' => 0,
            'postTypes' => array(),
            'resources' => array(),
            'inventoryPageSize' => SEOGROW_CONNECTOR_INVENTORY_PAGE_SIZE,
            'inventoryMaxResources' => SEOGROW_CONNECTOR_INVENTORY_MAX_RESOURCES,
            'sharedWriteAllowed' => false,
        ));
    }

    $count_query = new WP_Query(array(
        'post_type' => $post_types,
        'post_status' => 'publish',
        'fields' => 'ids',
        'posts_per_page' => 1,
        'paged' => 1,
        'no_found_rows' => false,
        'orderby' => 'ID',
        'order' => 'ASC',
        'ignore_sticky_posts' => true,
    ));

    $total_resources = max(0, (int) $count_query->found_posts);
    $over_limit = $total_resources > SEOGROW_CONNECTOR_INVENTORY_MAX_RESOURCES;
    if ($over_limit) {
        return rest_ensure_response(array(
            'ok' => true,
            'source' => 'seogrow-connector',
            'connectorVersion' => SEOGROW_CONNECTOR_VERSION,
            'inventoryScope' => 'all-public-queryable-post-types',
            'readOnly' => true,
            'complete' => false,
            'truncated' => true,
            'totalResources' => $total_resources,
            'postTypes' => $post_types,
            'resources' => array(),
            'inventoryPageSize' => SEOGROW_CONNECTOR_INVENTORY_PAGE_SIZE,
            'inventoryMaxResources' => SEOGROW_CONNECTOR_INVENTORY_MAX_RESOURCES,
            'sharedWriteAllowed' => false,
        ));
    }

    $resources = array();
    $seen = array();
    $pages = max(1, (int) ceil($total_resources / SEOGROW_CONNECTOR_INVENTORY_PAGE_SIZE));

    for ($page = 1; $page <= $pages; $page += 1) {
        $query = new WP_Query(array(
            'post_type' => $post_types,
            'post_status' => 'publish',
            'fields' => 'ids',
            'posts_per_page' => SEOGROW_CONNECTOR_INVENTORY_PAGE_SIZE,
            'paged' => $page,
            'no_found_rows' => true,
            'orderby' => 'ID',
            'order' => 'ASC',
            'ignore_sticky_posts' => true,
        ));

        foreach (array_values(array_filter(array_map('absint', (array) $query->posts))) as $id) {
            if (isset($seen[$id])) {
                continue;
            }
            $post = get_post($id);
            if (!$post || $post->post_status !== 'publish' || !in_array($post->post_type, $post_types, true)) {
                continue;
            }
            $permalink = get_permalink($id);
            if (!is_string($permalink) || !wp_http_validate_url($permalink)) {
                continue;
            }
            $seen[$id] = true;
            $resources[] = array(
                'id' => (int) $id,
                'postType' => (string) $post->post_type,
                'status' => 'publish',
                'url' => esc_url_raw($permalink),
            );
        }
    }

    $complete = count($resources) === $total_resources;

    return rest_ensure_response(array(
        'ok' => true,
        'source' => 'seogrow-connector',
        'connectorVersion' => SEOGROW_CONNECTOR_VERSION,
        'inventoryScope' => 'all-public-queryable-post-types',
        'readOnly' => true,
        'complete' => $complete,
        'truncated' => false,
        'totalResources' => $total_resources,
        'postTypes' => $post_types,
        'resources' => $resources,
        'inventoryPageSize' => SEOGROW_CONNECTOR_INVENTORY_PAGE_SIZE,
        'inventoryPagesRead' => $pages,
        'inventoryMaxResources' => SEOGROW_CONNECTOR_INVENTORY_MAX_RESOURCES,
        'sharedWriteAllowed' => false,
    ));
}

add_action('rest_api_init', static function () {
    register_rest_route('seogrow/v1', '/wordpress-public-inventory', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_wordpress_public_inventory_paged',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
    ), true);
});
