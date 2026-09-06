<?php

if (!defined('ABSPATH')) {
    exit;
}

add_filter('update_term_metadata', static function ($check, $object_id, $meta_key, $meta_value, $prev_value) {
    if ($meta_key !== 'rank_math_description' || !seogrow_connector_taxonomy_recovery_marker_valid($meta_value)) {
        return $check;
    }

    $term = get_term((int) $object_id);
    if (!$term || is_wp_error($term) || !in_array((string) $term->taxonomy, array('category', 'post_tag'), true)) {
        return $check;
    }

    $original = (string) get_term_meta((int) $object_id, 'rank_math_description', true);
    $marker = (string) $meta_value;
    if ($original === '' || $original === $marker || seogrow_connector_taxonomy_recovery_marker_valid($original)) {
        return $check;
    }

    $url = get_term_link($term);
    if (is_wp_error($url) || !is_string($url) || !wp_http_validate_url($url)) {
        return $check;
    }

    $key = seogrow_connector_taxonomy_recovery_key($term->term_id, $term->taxonomy, 'meta_description');
    $pending = get_option($key, null);
    if (is_array($pending) && !empty($pending['convergencePending'])) {
        // Preserve the original and attempt budget until explicit finalization.
        return $check;
    }
    $journal = array(
        'capability' => SEOGROW_TAXONOMY_RECOVERY_CAPABILITY,
        'url' => esc_url_raw($url),
        'termId' => (int) $term->term_id,
        'taxonomy' => (string) $term->taxonomy,
        'adapter' => 'rank-math',
        'field' => 'meta_description',
        'original' => $original,
        'marker' => $marker,
        'createdAt' => time(),
        'expiresAt' => time() + SEOGROW_TAXONOMY_RECOVERY_TTL,
        'autoArmed' => true,
    );
    update_option($key, $journal, false);
    return $check;
}, 10, 5);

add_action('updated_term_meta', static function ($meta_id, $object_id, $meta_key, $_meta_value) {
    if ($meta_key !== 'rank_math_description') {
        return;
    }
    $term = get_term((int) $object_id);
    if (!$term || is_wp_error($term) || !in_array((string) $term->taxonomy, array('category', 'post_tag'), true)) {
        return;
    }
    $key = seogrow_connector_taxonomy_recovery_key($term->term_id, $term->taxonomy, 'meta_description');
    $journal = get_option($key, null);
    if (!is_array($journal) || !empty($journal['convergencePending'])) {
        return;
    }
    $current = (string) get_term_meta((int) $object_id, 'rank_math_description', true);
    if ($current === (string) ($journal['original'] ?? '') && !seogrow_connector_taxonomy_recovery_marker_valid($current)) {
        delete_option($key);
    }
}, 20, 4);
