<?php
// Executable regression test: real Connector functions + WordPress hook semantics.
define('ABSPATH', __DIR__);
define('SEOGROW_TAXONOMY_RECOVERY_CAPABILITY', 'test');
define('SEOGROW_TAXONOMY_RECOVERY_TTL', 60);
$options = array(); $hooks = array(); $value = ''; $owner = true;
class WP_Error { public $code; public function __construct($code, $message = '', $data = array()) {$this->code=$code;} }
class WP_REST_Request { private $data; public function __construct($data) {$this->data=$data;} public function get_param($key) {return $this->data[$key] ?? null;} }
function add_action($name,$callback,$priority=10,$args=1) {global $hooks; $hooks[$name][]=$callback;}
function add_filter($name,$callback,$priority=10,$args=1) {add_action($name,$callback,$priority,$args);}
function get_option($key,$default=null) {global $options; return $options[$key] ?? $default;}
function update_option($key,$value,$autoload=false) {global $options; $options[$key]=$value; return true;}
function add_option($key,$value,$deprecated='',$autoload=false) {global $options; if(array_key_exists($key,$options)) return false; $options[$key]=$value;return true;}
function delete_option($key) {global $options; unset($options[$key]); return true;}
function seogrow_connector_taxonomy_recovery_key($id,$taxonomy,$field) {return "journal-$id-$taxonomy-$field";}
function seogrow_connector_taxonomy_recovery_marker_valid($v) {return strpos($v,'SeoGrow E2E categoria ')===0;}
function get_term($id) {return (object)array('term_id'=>$id,'taxonomy'=>'category');}
function get_term_link($term) {return 'https://example.test/category/yoga/';}
function wp_http_validate_url($url) {return true;}
function is_wp_error($v) {return $v instanceof WP_Error;}
function esc_url_raw($v) {return $v;}
function absint($v) {return abs((int)$v);}
function sanitize_key($v) {return $v;}
function wp_check_invalid_utf8($v) {return $v;}
function current_user_can(...$args) {return true;}
function seogrow_connector_find_exact_taxonomy_term($url) {return get_term(1);}
function seogrow_connector_taxonomy_plugins() {global $owner; return array('rankMath'=>$owner,'yoast'=>!$owner);}
function get_term_meta(...$args) {global $value; return $value;}
function update_term_meta($id,$key,$next,$previous=null) {
 global $value,$hooks;
 foreach($hooks['update_term_metadata'] ?? array() as $hook) $hook(null,$id,$key,$next,$previous);
 if($previous!==null && $value!==$previous) return false;
 $value=$next;
 foreach($hooks['updated_term_meta'] ?? array() as $hook) $hook(1,$id,$key,$next);
 return true;
}
function clean_term_cache(...$args) {}
function has_action($name) {return false;}
function rest_ensure_response($v) {return $v;}
class TestDb {public $termmeta='test'; public function prepare(...$args){return '';} public function get_col($query){global $value;return array($value);} }
$wpdb=new TestDb();
require __DIR__.'/../wordpress-plugin/seogrow-connector/taxonomy-doctor-state.php';
require __DIR__.'/../wordpress-plugin/seogrow-connector/taxonomy-doctor-convergence.php';
require __DIR__.'/../wordpress-plugin/seogrow-connector/taxonomy-recovery-auto-journal.php';
function verify($condition,$message) {if(!$condition) throw new Exception($message); echo "PASS $message\n";}
$marker='SeoGrow E2E categoria 2026-09-06T10:00:00Z';
$original=' Yoga & benessere  quotidiano ';
$value=$marker;
$args=array('url'=>'https://example.test/category/yoga/','termId'=>1,'taxonomy'=>'category','expectedMarker'=>$marker,'bootstrapOriginal'=>$original,'confirm'=>'YES_I_UNDERSTAND');
$key=seogrow_connector_taxonomy_recovery_key(1,'category','meta_description');
$result=seogrow_connector_taxonomy_doctor_recover_v2(new WP_REST_Request($args));
verify(!is_wp_error($result) && $value===$original,'recovery preserves exact original bytes');
verify(get_option($key)['convergencePending']===true,'updated_term_meta hook retains pending journal');
verify(get_option($key)['recoveryAttempts']===1,'attempt budget persisted');
update_term_meta(1,'rank_math_description',$marker);
verify(get_option($key)['recoveryAttempts']===1,'marker reversion cannot overwrite attempt budget');
$options[$key]['expiresAt']=time()-1;
$result=seogrow_connector_taxonomy_doctor_recover_v2(new WP_REST_Request($args));
verify(!is_wp_error($result) && get_option($key)['recoveryAttempts']===2,'expired pending journal remains authoritative');
update_term_meta(1,'rank_math_description',$marker);
$result=seogrow_connector_taxonomy_doctor_recover_v2(new WP_REST_Request($args));
verify(is_wp_error($result) && $result->code==='RECOVERY_REVERT_LOOP_DETECTED' && $value===$marker,'third cross-request recovery fails closed');
$value=$original;
$owner=false;
$result=seogrow_connector_taxonomy_doctor_finalize_recovery(new WP_REST_Request($args+array('expectedOriginal'=>$original)));
verify(is_wp_error($result) && get_option($key)!==null,'ownership change blocks finalization');
$owner=true;
$result=seogrow_connector_taxonomy_doctor_finalize_recovery(new WP_REST_Request($args+array('expectedOriginal'=>'different')));
verify(is_wp_error($result) && get_option($key)!==null,'stale expected original retains journal');
$result=seogrow_connector_taxonomy_doctor_finalize_recovery(new WP_REST_Request($args+array('expectedOriginal'=>$original)));
verify(!is_wp_error($result) && get_option($key)===null,'explicit matching finalization clears journal');

$options[$key.'_lock']=time();
$value=$marker;
$result=seogrow_connector_taxonomy_doctor_recover_v2(new WP_REST_Request($args));
verify(is_wp_error($result) && $result->code==='RECOVERY_BUSY_OR_INTERRUPTED' && $value===$marker,'concurrent recovery blocked without writes');
