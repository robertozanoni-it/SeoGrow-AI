<?php

if (!defined('ABSPATH')) {
    exit;
}

function seogrow_connector_elementor_reference_data(WP_REST_Request $request) {
    if (!(defined('ELEMENTOR_VERSION') || class_exists('Elementor\\Plugin'))) {
        return new WP_Error('seogrow_elementor_unavailable', 'Elementor non risulta attivo.', array('status' => 409));
    }

    $raw_ids = (string) $request->get_param('ids');
    $ids = array();
    foreach (array_slice(explode(',', $raw_ids), 0, 30) as $value) {
        $id = absint($value);
        if ($id > 0) {
            $ids[$id] = $id;
        }
    }
    $ids = array_values($ids);
    if (!$ids) {
        return new WP_Error('seogrow_elementor_reference_ids_required', 'Indica almeno un ID WordPress da ispezionare.', array('status' => 400));
    }

    $public_post_types = function_exists('seogrow_connector_public_queryable_post_types')
        ? seogrow_connector_public_queryable_post_types()
        : array();
    $documents = array();

    foreach ($ids as $id) {
        $post = get_post($id);
        if (!$post || $post->post_status !== 'publish' || !in_array($post->post_type, $public_post_types, true)) {
            $documents[] = array(
                'ok' => false,
                'id' => (int) $id,
                'error' => 'La risorsa non è un contenuto pubblico/queryable pubblicato dell’inventario WordPress.',
                'readOnly' => true,
            );
            continue;
        }
        if (!current_user_can('edit_post', $id)) {
            $documents[] = array(
                'ok' => false,
                'id' => (int) $id,
                'error' => 'Permessi insufficienti per leggere questa risorsa WordPress.',
                'readOnly' => true,
            );
            continue;
        }

        $permalink = get_permalink($id);
        if (!is_string($permalink) || !wp_http_validate_url($permalink)) {
            $documents[] = array(
                'ok' => false,
                'id' => (int) $id,
                'error' => 'Permalink WordPress non verificabile.',
                'readOnly' => true,
            );
            continue;
        }

        $data_observed = metadata_exists('post', $id, '_elementor_data');
        $raw_data = $data_observed ? get_post_meta($id, '_elementor_data', true) : '';
        if (is_array($raw_data) || is_object($raw_data)) {
            $raw_data = wp_json_encode($raw_data);
        }
        if (!is_scalar($raw_data) && $raw_data !== null) {
            $documents[] = array(
                'ok' => false,
                'id' => (int) $id,
                'postType' => (string) $post->post_type,
                'url' => esc_url_raw($permalink),
                'error' => '_elementor_data ha un tipo non supportato.',
                'readOnly' => true,
            );
            continue;
        }

        $documents[] = array(
            'ok' => true,
            'id' => (int) $id,
            'postType' => (string) $post->post_type,
            'status' => 'publish',
            'url' => esc_url_raw($permalink),
            'elementorDataObserved' => (bool) $data_observed,
            'elementorData' => (string) $raw_data,
            'readOnly' => true,
            'sharedWriteAllowed' => false,
        );
    }

    return rest_ensure_response(array(
        'ok' => true,
        'source' => 'seogrow-connector',
        'connectorVersion' => defined('SEOGROW_CONNECTOR_VERSION') ? SEOGROW_CONNECTOR_VERSION : '',
        'resource' => 'elementor-reference-data',
        'readOnly' => true,
        'complete' => count($documents) === count($ids) && !array_filter($documents, static function ($document) {
            return empty($document['ok']);
        }),
        'requestedDocuments' => count($ids),
        'documents' => $documents,
        'sharedWriteAllowed' => false,
    ));
}

add_action('rest_api_init', static function () {
    register_rest_route('seogrow/v1', '/elementor-reference-data', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'seogrow_connector_elementor_reference_data',
        'permission_callback' => static function () {
            return current_user_can('edit_posts') || current_user_can('edit_pages');
        },
        'args' => array(
            'ids' => array(
                'required' => true,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
            ),
        ),
    ));
});
