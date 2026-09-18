<?php
define('ABSPATH', __DIR__);
define('ARRAY_A', 'ARRAY_A');

class WP_Error {
    public $code; public $message; public $data;
    public function __construct($code, $message, $data = array()) { $this->code=$code; $this->message=$message; $this->data=$data; }
    public function get_error_code() { return $this->code; }
}
class WP_REST_Request {
    private $data;
    public function __construct($data) { $this->data=$data; }
    public function get_param($key) { return array_key_exists($key, $this->data) ? $this->data[$key] : null; }
}
function is_wp_error($value) { return $value instanceof WP_Error; }
function add_action($name, $callback) {}
function current_user_can($cap, $id = null) { return $GLOBALS['allowed']; }
function esc_url_raw($value) { return (string) $value; }
function clean_term_cache($id, $taxonomy = '') { $GLOBALS['term_cache_cleans'][] = array($id,$taxonomy); }
function wp_cache_delete($id, $group = '') { $GLOBALS['cache_deletes'][] = array($id,$group); return true; }
function get_term_link($term) { return 'https://example.test/category/test/'; }
function get_term_meta($id, $key, $single = false) { return $GLOBALS['wpdb']->meta_value; }

$GLOBALS['allowed'] = true;
$GLOBALS['term_cache_cleans'] = array();
$GLOBALS['cache_deletes'] = array();

class TaxonomyDb {
    public $terms='wp_terms';
    public $term_taxonomy='wp_term_taxonomy';
    public $termmeta='wp_termmeta';
    public $posts='wp_posts';
    public $postmeta='wp_postmeta';
    public $meta_value='Old description';
    public $duplicate=false;
    public $updates=0;

    public function prepare($sql, ...$args) {
        if (count($args) === 1 && is_array($args[0])) $args = $args[0];
        return array('sql'=>$sql,'args'=>$args);
    }
    private function sql($query) { return is_array($query) ? $query['sql'] : $query; }
    private function args($query) { return is_array($query) ? $query['args'] : array(); }

    public function get_var($query) {
        $sql=$this->sql($query);
        if (strpos($sql,'information_schema.TABLES') !== false) return 'InnoDB';
        if (strpos($sql,'@@session.autocommit') !== false) return '1';
        if (strpos($sql,'SELECT meta_value FROM') !== false) return $this->meta_value;
        return null;
    }
    public function get_row($query, $format = null) {
        $sql=$this->sql($query);
        if (strpos($sql,'FROM wp_terms') !== false && strpos($sql,'wp_term_taxonomy') !== false) {
            return array('term_id'=>7,'slug'=>'test','taxonomy'=>'category');
        }
        return null;
    }
    public function get_results($query, $format = null) {
        $sql=$this->sql($query);
        if (strpos($sql,'FROM wp_termmeta') === false) return array();
        $rows=array(array('meta_id'=>99,'meta_key'=>'rank_math_description','meta_value'=>$this->meta_value));
        if ($this->duplicate) $rows[]=array('meta_id'=>100,'meta_key'=>'rank_math_description','meta_value'=>$this->meta_value);
        return $rows;
    }
    public function query($query) {
        if (is_string($query)) {
            if (preg_match('/^(SET TRANSACTION|START TRANSACTION|COMMIT|ROLLBACK)/', $query)) return 1;
            return 0;
        }
        $sql=$query['sql']; $args=$query['args'];
        if (strpos($sql,'UPDATE wp_termmeta') !== false) {
            $this->updates++;
            [$after,$metaId,$termId,$key,$before]=$args;
            if ($metaId !== 99 || $termId !== 7 || $key !== 'rank_math_description' || $this->meta_value !== $before) return 0;
            $this->meta_value=$after;
            return 1;
        }
        return 0;
    }
}

$wpdb = new TaxonomyDb();

function seogrow_connector_find_exact_taxonomy_term($url) {
    return (object) array('term_id'=>7,'taxonomy'=>'category','slug'=>'test');
}
function seogrow_connector_taxonomy_validate_write($term, $adapter, $field, $value, $expected_current) {
    global $wpdb;
    if ($field === 'noindex') return array('current'=>(bool)$expected_current,'next'=>(bool)$value);
    $current=(string)$wpdb->meta_value;
    if ((string)$expected_current !== $current) {
        return new WP_Error('seogrow_taxonomy_stale','stale',array('status'=>409));
    }
    return array('current'=>$current,'next'=>(string)$value);
}

require_once __DIR__ . '/../wordpress-plugin/seogrow-connector/atomic-write.php';
function check($condition, $message) { if (!$condition) throw new Exception($message); }
function request_data($operation, $adapter, $before, $after, $field='meta_description') {
    return array(
        'operation'=>$operation,
        'resource'=>'taxonomy',
        'id'=>7,
        'url'=>'https://example.test/category/test/',
        'taxonomy'=>'category',
        'adapter'=>$adapter,
        'field'=>$field,
        'expectedCurrent'=>array($field=>$before),
        'changes'=>array($field=>$after),
    );
}

$apply=seogrow_connector_atomic_write(new WP_REST_Request(request_data('apply','rank-math','Old description','New description')));
check(is_array($apply) && $apply['ok'] === true, 'Rank Math taxonomy apply must succeed');
check($apply['atomicGuaranteed'] === true && $apply['staleChecked'] === true && $apply['singleField'] === true, 'Atomic flags missing');
check($apply['before'] === 'Old description' && $apply['after'] === 'New description', 'Before/after mismatch');
check($apply['term']['id'] === 7 && $apply['adapter'] === 'rank-math', 'Identity/adapter mismatch');
check($apply['persistenceProof']['verified'] === true && $apply['persistenceProof']['dbRowCount'] === 1, 'Persistence proof missing');
check($wpdb->meta_value === 'New description', 'Apply did not change termmeta');

$rollback=seogrow_connector_atomic_write(new WP_REST_Request(request_data('rollback','rank-math','New description','Old description')));
check(is_array($rollback) && $rollback['ok'] === true && $wpdb->meta_value === 'Old description', 'Rollback failed');

$beforeUpdates=$wpdb->updates;
$stale=seogrow_connector_atomic_write(new WP_REST_Request(request_data('apply','rank-math','Wrong description','Never write')));
check($stale instanceof WP_Error && $stale->code === 'STALE_CONFLICT', 'Stale taxonomy snapshot must map to STALE_CONFLICT');
check($wpdb->updates === $beforeUpdates && $wpdb->meta_value === 'Old description', 'Stale request must not mutate');

$wpdb->duplicate=true;
$duplicate=seogrow_connector_atomic_write(new WP_REST_Request(request_data('apply','rank-math','Old description','Never write duplicate')));
check($duplicate instanceof WP_Error && $duplicate->code === 'ATOMIC_WRITE_UNAVAILABLE', 'Duplicate termmeta must fail closed');
check($wpdb->meta_value === 'Old description', 'Duplicate termmeta path mutated');
$wpdb->duplicate=false;

$yoast=seogrow_connector_atomic_write(new WP_REST_Request(request_data('apply','yoast','Old description','Yoast target')));
check($yoast instanceof WP_Error && $yoast->code === 'ATOMIC_WRITE_UNAVAILABLE', 'Yoast taxonomy must remain fail-closed');

$noindex=seogrow_connector_atomic_write(new WP_REST_Request(request_data('apply','rank-math',false,true,'noindex')));
check($noindex instanceof WP_Error && $noindex->code === 'ATOMIC_WRITE_UNAVAILABLE', 'Rank Math robots/noindex must remain fail-closed');

check(count($GLOBALS['term_cache_cleans']) >= 2, 'Term cache must be cleared after apply/rollback');
check(count($GLOBALS['cache_deletes']) >= 2, 'Term meta cache must be cleared after apply/rollback');
echo "Rank Math taxonomy termmeta CAS contracts passed; Yoast/noindex remain fail-closed.\n";
