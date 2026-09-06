<?php
// Isolated behavioral contract: zero DB writes on every unsupported path.
define('ABSPATH', __DIR__);
define('ARRAY_A', 'ARRAY_A');
class WP_Error {
    public $code; public $message; public $data;
    function __construct($code, $message, $data) { $this->code=$code; $this->message=$message; $this->data=$data; }
}
class WP_REST_Request {
    private $data;
    function __construct($data) { $this->data=$data; }
    function get_param($key) { return isset($this->data[$key]) ? $this->data[$key] : null; }
}
function add_action($name, $callback) {}
function maybe_unserialize($value) { return $value; }
function current_user_can($cap, $id = null) { return $GLOBALS['allowed']; }
$GLOBALS['allowed'] = true;
class TestDb {
    public $posts = 'wp_posts';
    public $postmeta = 'wp_postmeta';
    public $meta = array('Current meta');
    function get_col($sql) { return $this->meta; }
    public $writes = 0;
    function prepare($sql, $id) { return $sql; }
    function get_row($sql, $format) { return array('ID'=>12, 'post_type'=>'page', 'post_title'=>'Current', 'post_content'=>'Body', 'post_excerpt'=>''); }
    function query($sql) { $this->writes++; throw new Exception('Unexpected write'); }
}
$wpdb = new TestDb();
require __DIR__ . '/../wordpress-plugin/seogrow-connector/atomic-write.php';
function check($condition) { if (!$condition) { throw new Exception('Atomic write contract failed'); } }
foreach (array('apply', 'rollback') as $operation) {
    $data = array('operation'=>$operation, 'resource'=>'pages', 'id'=>12, 'changes'=>array('title'=>'New'), 'expectedCurrent'=>array('title'=>'Old'));
    check(seogrow_connector_atomic_write(new WP_REST_Request($data))->code === 'STALE_CONFLICT');
    $data['expectedCurrent']['title'] = 'Current';
    check(seogrow_connector_atomic_write(new WP_REST_Request($data))->code === 'ATOMIC_WRITE_UNAVAILABLE');
    $data['expectedCurrent'] = array();
    check(seogrow_connector_atomic_write(new WP_REST_Request($data))->code === 'EXPECTED_CURRENT_REQUIRED');
}
foreach (array('apply', 'rollback') as $operation) {
    $data = array('operation'=>$operation, 'resource'=>'pages', 'id'=>12, 'changes'=>array('meta'=>array('_elementor_data'=>'New')), 'expectedCurrent'=>array('meta'=>array('_elementor_data'=>'Old')));
    check(seogrow_connector_atomic_write(new WP_REST_Request($data))->code === 'STALE_CONFLICT');
    $data['expectedCurrent']['meta']['_elementor_data'] = 'Current meta';
    check(seogrow_connector_atomic_write(new WP_REST_Request($data))->code === 'ATOMIC_WRITE_UNAVAILABLE');
    $wpdb->meta = array('Current meta', 'duplicate');
    check(seogrow_connector_atomic_write(new WP_REST_Request($data))->code === 'ATOMIC_WRITE_UNAVAILABLE');
    $wpdb->meta = array();
    check(seogrow_connector_atomic_write(new WP_REST_Request($data))->code === 'ATOMIC_WRITE_UNAVAILABLE');
    $wpdb->meta = array('Current meta');
}
$GLOBALS['allowed'] = false;
check(seogrow_connector_atomic_write(new WP_REST_Request(array('operation'=>'apply','resource'=>'pages','id'=>12,'changes'=>array('title'=>'New'),'expectedCurrent'=>array('title'=>'Current'))))->code === 'ATOMIC_WRITE_FORBIDDEN');
check($wpdb->writes === 0);
echo "Atomic apply/rollback fail-closed contracts passed; zero writes.\n";
