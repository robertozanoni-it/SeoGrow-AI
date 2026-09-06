<?php
// Isolated behavioral contract for the Connector atomic writer.
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
function current_user_can($cap, $id = null) { return $GLOBALS['allowed']; }
function clean_post_cache($id) { $GLOBALS['cache_cleans'][] = $id; }
function get_permalink($id) { return 'https://example.test/page/'; }
$GLOBALS['allowed'] = true;
$GLOBALS['cache_cleans'] = array();

class TestDb {
    public $posts = 'wp_posts';
    public $postmeta = 'wp_postmeta';
    public $writes = 0;
    public $row = array(
        'ID'=>12, 'post_type'=>'page', 'post_status'=>'publish',
        'post_title'=>'Current', 'post_content'=>'Body', 'post_excerpt'=>'Excerpt'
    );
    public $fail_next = false;

    function prepare($sql, ...$args) {
        if (count($args) === 1 && is_array($args[0])) $args = $args[0];
        return array('sql'=>$sql, 'args'=>$args);
    }
    function get_row($prepared, $format) { return $this->row; }
    function query($prepared) {
        $this->writes++;
        if ($this->fail_next) { $this->fail_next = false; return false; }
        $sql = $prepared['sql'];
        $args = $prepared['args'];
        $set = substr($sql, strpos($sql, ' SET ') + 5, strpos($sql, ' WHERE ') - (strpos($sql, ' SET ') + 5));
        $set_parts = array_map('trim', explode(',', $set));
        $where = substr($sql, strpos($sql, ' WHERE ') + 7);
        $set_count = count($set_parts);
        $expected_args = array_slice($args, $set_count + 2);
        preg_match_all('/BINARY (post_title|post_content|post_excerpt) = BINARY %s/', $where, $matches);
        foreach ($matches[1] as $index => $column) {
            if ($this->row[$column] !== $expected_args[$index]) return 0;
        }
        foreach ($set_parts as $index => $part) {
            if (!preg_match('/^(post_title|post_content|post_excerpt) = %s$/', $part, $match)) throw new Exception('Unexpected SET');
            $this->row[$match[1]] = $args[$index];
        }
        return 1;
    }
}

$wpdb = new TestDb();
require __DIR__ . '/../wordpress-plugin/seogrow-connector/atomic-write.php';
function check($condition, $message = 'Atomic write contract failed') { if (!$condition) { throw new Exception($message); } }

foreach (array('apply', 'rollback') as $operation) {
    $wpdb->row['post_title'] = $operation === 'apply' ? 'Current' : 'New';
    $expected = $wpdb->row['post_title'];
    $target = $operation === 'apply' ? 'New' : 'Current';
    $data = array('operation'=>$operation, 'resource'=>'pages', 'id'=>12, 'changes'=>array('title'=>$target), 'expectedCurrent'=>array('title'=>$expected));
    $result = seogrow_connector_atomic_write(new WP_REST_Request($data));
    check(is_array($result) && $result['ok'] === true && $result['atomicGuaranteed'] === true && $result['staleChecked'] === true);
    check($result['entity']['title']['raw'] === $target);
    check($wpdb->row['post_title'] === $target);
}

// One-row multi-field CAS is all-or-nothing and byte-exact.
$wpdb->row['post_title'] = 'Case Sensitive';
$wpdb->row['post_content'] = 'Old body';
$before_writes = $wpdb->writes;
$result = seogrow_connector_atomic_write(new WP_REST_Request(array(
    'operation'=>'apply','resource'=>'pages','id'=>12,
    'changes'=>array('title'=>'New title','content'=>'New body'),
    'expectedCurrent'=>array('title'=>'Case Sensitive','content'=>'Old body'),
)));
check(is_array($result) && $result['entity']['title']['raw'] === 'New title' && $result['entity']['content']['raw'] === 'New body');
check($wpdb->writes === $before_writes + 1);

$before_writes = $wpdb->writes;
$stale = seogrow_connector_atomic_write(new WP_REST_Request(array(
    'operation'=>'apply','resource'=>'pages','id'=>12,
    'changes'=>array('title'=>'Should not write'),
    'expectedCurrent'=>array('title'=>'new title'),
)));
check($stale instanceof WP_Error && $stale->code === 'STALE_CONFLICT');
check($wpdb->writes === $before_writes, 'Stale precondition must not issue UPDATE');
check($wpdb->row['post_title'] === 'New title');

// Meta remains fail-closed and cannot cause a partial core-field write.
$before_writes = $wpdb->writes;
$blocked = seogrow_connector_atomic_write(new WP_REST_Request(array(
    'operation'=>'apply','resource'=>'pages','id'=>12,
    'changes'=>array('title'=>'Mixed','meta'=>array('_elementor_data'=>'New')),
    'expectedCurrent'=>array('title'=>'New title','meta'=>array('_elementor_data'=>'Old')),
)));
check($blocked instanceof WP_Error && $blocked->code === 'ATOMIC_WRITE_UNAVAILABLE');
check($wpdb->writes === $before_writes && $wpdb->row['post_title'] === 'New title');

// Database ambiguity is never reported as success.
$wpdb->fail_next = true;
$failed = seogrow_connector_atomic_write(new WP_REST_Request(array(
    'operation'=>'apply','resource'=>'pages','id'=>12,
    'changes'=>array('title'=>'Failure target'),
    'expectedCurrent'=>array('title'=>'New title'),
)));
check($failed instanceof WP_Error && $failed->code === 'ATOMIC_RESULT_UNVERIFIED');

$GLOBALS['allowed'] = false;
$forbidden = seogrow_connector_atomic_write(new WP_REST_Request(array(
    'operation'=>'apply','resource'=>'pages','id'=>12,
    'changes'=>array('title'=>'No'), 'expectedCurrent'=>array('title'=>'New title')
)));
check($forbidden instanceof WP_Error && $forbidden->code === 'ATOMIC_WRITE_FORBIDDEN');
check(count($GLOBALS['cache_cleans']) >= 3);
echo "Atomic posts/pages CAS contracts passed; stale and meta paths remain fail-closed.\n";
