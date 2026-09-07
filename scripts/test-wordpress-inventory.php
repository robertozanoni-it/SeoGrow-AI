<?php
// Behavioral regression: native pages must participate in shared-impact inventory.
define('ABSPATH', __DIR__);
define('ELEMENTOR_VERSION', 'test');
function add_action(...$args) {}
function sanitize_key($value) { return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)); }
function absint($value) { return abs((int) $value); }
function rest_ensure_response($value) { return $value; }
function esc_url_raw($value) { return $value; }
function wp_http_validate_url($url) { return strpos($url, 'https://example.test/') === 0; }
function get_permalink($id) { return 'https://example.test/resource-' . $id . '/'; }
function get_post($id) { return $GLOBALS['posts'][$id] ?? null; }
function current_user_can(...$args) { return $GLOBALS['allowed']; }
function metadata_exists(...$args) { return true; }
function get_post_meta(...$args) { return '[]'; }
function get_post_types($filters, $output) {
    if ($GLOBALS['invalid_registry']) { return false; }
    return array_filter($GLOBALS['types'], static function ($type) use ($filters) {
        foreach ($filters as $key => $value) {
            if ($type->$key !== $value) { return false; }
        }
        return true;
    });
}
// WordPress visibility semantics, including a simulated filter denial.
function is_post_type_viewable($type) {
    return $type->name !== 'filtered' && ($type->publicly_queryable || ($type->_builtin && $type->public));
}
class WP_REST_Request {
    private $ids;
    public function __construct($ids) { $this->ids = $ids; }
    public function get_param($key) { return $key === 'ids' ? $this->ids : null; }
}
class WP_Query {
    public $found_posts;
    public $posts;
    public function __construct($args) {
        $ids = array_keys(array_filter($GLOBALS['posts'], static function ($post) use ($args) {
            return in_array($post->post_type, $args['post_type'], true) && $post->post_status === $args['post_status'];
        }));
        sort($ids);
        $this->found_posts = count($ids);
        $offset = (($args['paged'] ?? 1) - 1) * $args['posts_per_page'];
        $this->posts = array_slice($ids, $offset, $args['posts_per_page']);
    }
}
require __DIR__ . '/../wordpress-plugin/seogrow-connector/seogrow-connector-core.inc';
require __DIR__ . '/../wordpress-plugin/seogrow-connector/wordpress-public-inventory-paged.php';
require __DIR__ . '/../wordpress-plugin/seogrow-connector/elementor-reference-read.php';

function expect_same($expected, $actual, $message) {
    if ($actual !== $expected) { throw new RuntimeException($message . ': ' . json_encode($actual)); }
}
$GLOBALS['allowed'] = true;
$GLOBALS['invalid_registry'] = false;
$GLOBALS['types'] = array();
foreach (array(
    array('page', true, false, true),
    array('post', true, true, true),
    array('book', true, true, false),
    array('hidden', true, false, false),
    array('private', false, true, false),
    array('filtered', true, true, false),
) as $row) {
    $GLOBALS['types'][] = (object) array('name' => $row[0], 'public' => $row[1], 'publicly_queryable' => $row[2], '_builtin' => $row[3]);
}
$GLOBALS['posts'] = array();
foreach (array('page', 'post', 'book', 'hidden', 'private', 'filtered', 'page') as $index => $type) {
    $id = $index + 1;
    $GLOBALS['posts'][$id] = (object) array('ID' => $id, 'post_type' => $type, 'post_status' => $id === 7 ? 'draft' : 'publish');
}
expect_same(array('book', 'page', 'post'), seogrow_connector_public_queryable_post_types(), 'Public native pages and viewable CPTs included; hidden/private/filter-denied types excluded');
foreach (array('seogrow_connector_wordpress_public_inventory', 'seogrow_connector_wordpress_public_inventory_paged') as $inventory) {
    $result = $inventory();
    expect_same(array(1, 2, 3), array_column($result['resources'], 'id'), 'Inventory must include native page and omit drafts');
    expect_same(3, $result['totalResources'], 'Complete count includes pages');
    expect_same(true, $result['complete'], 'Complete inventory');
    expect_same(false, $result['sharedWriteAllowed'], 'Shared write guard stays closed');
}
$result = seogrow_connector_elementor_reference_data(new WP_REST_Request('1'));
expect_same(true, $result['complete'], 'Page reference read must be accepted');
expect_same('page', $result['documents'][0]['postType'], 'Native page identity preserved');
$GLOBALS['allowed'] = false;
expect_same(false, seogrow_connector_elementor_reference_data(new WP_REST_Request('1'))['complete'], 'Page permissions still required');
$GLOBALS['invalid_registry'] = true;
expect_same(false, seogrow_connector_wordpress_public_inventory_paged()['complete'], 'Invalid type registry fails closed');
echo "WordPress inventory native-page regression: PASS\n";
