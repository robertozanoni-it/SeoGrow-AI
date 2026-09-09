<?php
namespace Elementor {
    class Plugin { public static $instance; }
}
namespace Elementor\Core\Files\CSS {
    class Post { public static function create($id) { return new self(); } public function delete() {} }
}
namespace {
define('ABSPATH', __DIR__); define('ARRAY_A', 'ARRAY_A');
class WP_Error { public $code; public $message; public $data; public function __construct($code,$message,$data) {$this->code=$code;$this->message=$message;$this->data=$data;} }
class WP_REST_Request { private $data; public function __construct($data) {$this->data=$data;} public function get_param($key) {return isset($this->data[$key]) ? $this->data[$key] : null;} }
function current_user_can($cap,$id=null) {return $GLOBALS['can_edit'];}
function add_action($name,$callback) {}
function clean_post_cache($id) {}
function wp_cache_delete($id,$group) {}
function get_permalink($id) {return 'https://example.test/qa/';}
function wp_json_encode($v) {return json_encode($v);}
function wp_kses($v,$tags) {return strip_tags($v,implode('',array_map(static function($tag){return '<'.$tag.'>';},array_keys($tags))));}
function check($v,$m) {if(!$v)throw new \RuntimeException($m);}
require __DIR__.'/../wordpress-plugin/seogrow-connector/elementor-text-write.php';
require __DIR__.'/../wordpress-plugin/seogrow-connector/atomic-write.php';
$GLOBALS['can_edit']=true;
$base = json_encode(array((object)array('id'=>'a123','elType'=>'container','settings'=>(object)array('container_type'=>'flex'),'elements'=>array((object)array('id'=>'b123','elType'=>'widget','widgetType'=>'heading','settings'=>(object)array('title'=>'Before','header_size'=>'h1','typography_font_size'=>(object)array('unit'=>'px','size'=>36)),'elements'=>array())))));
$target=str_replace('Before','After',$base);
function payload($before,$after,$operation='apply') {return array('id'=>12,'resource'=>'pages','operation'=>$operation,'expectedCurrent'=>array('meta'=>array('_elementor_data'=>$before)),'changes'=>array('meta'=>array('_elementor_data'=>$after)));}
$p=payload($base,$target);
check(seogrow_elementor_text_validate($p['expectedCurrent'],$p['changes'])!==false,'Valid text change');
foreach(array(str_replace('36','40',$target),str_replace('heading','html',$target),str_replace('b123','a123',$target),str_replace('After','[shortcode]',$target),str_replace('After','<script>x</script>',$target),'null','[]') as $invalid) {
 $p=payload($base,$invalid);check(seogrow_elementor_text_validate($p['expectedCurrent'],$p['changes'])===false,'Reject unsafe/structural change');
}
$p=payload($base,$target);$p['changes']['title']='Mixed';check(seogrow_elementor_text_validate($p['expectedCurrent'],$p['changes'])===false,'Reject mixed core/meta writes');
check(seogrow_elementor_text_validate(null, null)===false,'Malformed payload refused');
$unsafe=str_replace('Before','[shortcode]',$base);$p=payload($unsafe,$target);
check(seogrow_elementor_text_validate($p['expectedCurrent'],$p['changes'])===false,'Existing executable content refused');
$dsn=getenv('SEOGROW_TEST_MYSQL_DSN');
if(!$dsn)throw new \RuntimeException('Real MySQL DSN required; database safety tests must not be silently skipped.');
$pdo=new \PDO($dsn,'root',getenv('SEOGROW_TEST_MYSQL_PASSWORD'),array(\PDO::ATTR_ERRMODE=>\PDO::ERRMODE_EXCEPTION));
$other=new \PDO($dsn,'root',getenv('SEOGROW_TEST_MYSQL_PASSWORD'),array(\PDO::ATTR_ERRMODE=>\PDO::ERRMODE_EXCEPTION));
$other->exec('SET SESSION innodb_lock_wait_timeout=1');
$pdo->exec('CREATE TABLE qa_posts (ID BIGINT PRIMARY KEY,post_type VARCHAR(20),post_status VARCHAR(20),post_title TEXT,post_content LONGTEXT,post_excerpt TEXT) ENGINE=InnoDB');
$pdo->exec('CREATE TABLE qa_postmeta (meta_id BIGINT AUTO_INCREMENT PRIMARY KEY,post_id BIGINT NOT NULL,meta_key VARCHAR(255),meta_value LONGTEXT,KEY post_id(post_id)) ENGINE=InnoDB');
class TestWpdb {
 public $posts='qa_posts';public $postmeta='qa_postmeta';public $pdo;
 public function __construct($pdo){$this->pdo=$pdo;}
 public function prepare($sql,...$args){if(count($args)===1&&is_array($args[0]))$args=$args[0];$i=0;return preg_replace_callback('/%[sd]/',function($m)use(&$i,$args){$v=$args[$i++];return $m[0]==='%d'?(string)(int)$v:$this->pdo->quote($v);},$sql);}
 public function query($sql){try{return $this->pdo->exec($sql);}catch(\PDOException $e){return false;}}
 public function get_var($sql){return $this->pdo->query($sql)->fetchColumn();}
 public function get_row($sql,$format){return $this->pdo->query($sql)->fetch(\PDO::FETCH_ASSOC);}
 public function get_results($sql,$format){return $this->pdo->query($sql)->fetchAll(\PDO::FETCH_ASSOC);}
}
$wpdb=new TestWpdb($pdo);
class TestDocument {
 public function get_main_id(){return 12;} public function get_name(){return 'wp-page';} public function is_editable_by_current_user(){return true;}
 public function save($data){
  global $pdo;
  if(isset($GLOBALS['save_hook']))($GLOBALS['save_hook'])();
  $encoded=json_encode($data['elements']);
  if(!empty($GLOBALS['alter_save']))$encoded=str_replace('36','99',$encoded);
  $pdo->prepare("UPDATE qa_postmeta SET meta_value=? WHERE post_id=12 AND meta_key='_elementor_data'")->execute(array($encoded));
  $pdo->exec("UPDATE qa_posts SET post_content='native saved HTML' WHERE ID=12");
  return empty($GLOBALS['fail_save']);
 }
}
class TestDocuments { public function get($id,$cache){return new TestDocument();} }
\Elementor\Plugin::$instance=(object)array('documents'=>new TestDocuments());
function reset_page($data){
 global $pdo;
 unset($GLOBALS['save_hook'],$GLOBALS['alter_save'],$GLOBALS['fail_save']);
 $pdo->exec('DELETE FROM qa_posts');$pdo->exec('DELETE FROM qa_postmeta');
 $pdo->exec("INSERT INTO qa_posts VALUES(12,'page','draft','Title','Original HTML','')");
 $insert=$pdo->prepare('INSERT INTO qa_postmeta(post_id,meta_key,meta_value) VALUES(12,?,?)');
 foreach(array('_wp_page_template'=>'elementor_canvas','_elementor_edit_mode'=>'builder','_elementor_template_type'=>'wp-page','_seogrow_elementor_text_enabled'=>'1','_elementor_data'=>$data) as $k=>$v)$insert->execute(array($k,$v));
}
function live_data(){global $pdo;return $pdo->query("SELECT meta_value FROM qa_postmeta WHERE post_id=12 AND meta_key='_elementor_data'")->fetchColumn();}
reset_page($base);
$result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
check(is_array($result)&&$result['atomicGuaranteed']&&live_data()===$target,'Real database apply');
$result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$base,'rollback')));
check($result instanceof WP_Error&&$result->code==='STALE_CONFLICT'&&live_data()===$target,'Stale rollback must not overwrite');
$result=seogrow_connector_atomic_write(new WP_REST_Request(payload($target,$base,'rollback')));
check(is_array($result)&&live_data()===$base,'Exact rollback');
foreach(array('update','insert') as $race){
 reset_page($base);
 $GLOBALS['save_hook']=function()use($other,$race){
  try {
   if($race==='update')$other->exec("UPDATE qa_postmeta SET meta_value='concurrent' WHERE post_id=12 AND meta_key='_elementor_data'");
   else $other->exec("INSERT INTO qa_postmeta(post_id,meta_key,meta_value) VALUES(12,'_elementor_data','duplicate')");
   throw new \RuntimeException('Concurrent writer escaped database locks');
  }catch(\PDOException $e){check((int)$e->errorInfo[1]===1205,'Expected lock wait timeout');}
 };
 $result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
 check(is_array($result)&&live_data()===$target,'Data and metadata range locked during native save: '.$race);
}
foreach(array('alter_save','fail_save') as $failure){
 reset_page($base);$GLOBALS[$failure]=true;
 $result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
 check($result instanceof WP_Error&&$result->code==='ATOMIC_RESULT_UNVERIFIED','Native save failure never succeeds');
 check(live_data()===$base&&$pdo->query('SELECT post_content FROM qa_posts WHERE ID=12')->fetchColumn()==='Original HTML','Transaction rolls back all document rows');
}
foreach(array("UPDATE qa_posts SET post_status='publish' WHERE ID=12", "UPDATE qa_postmeta SET meta_value='default' WHERE meta_key='_wp_page_template'") as $mutation) {
 reset_page($base);$GLOBALS['save_hook']=function()use($pdo,$mutation){$pdo->exec($mutation);};
 $result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
 check($result instanceof WP_Error&&$result->code==='ATOMIC_RESULT_UNVERIFIED'&&live_data()===$base,'Native hook changing scope refused');
 check($pdo->query('SELECT post_status FROM qa_posts WHERE ID=12')->fetchColumn()==='draft','Publication rolled back');
}
reset_page($base);$GLOBALS['save_hook']=function()use($pdo){$pdo->exec('COMMIT');};
$result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
check($result instanceof WP_Error&&$result->code==='ATOMIC_RESULT_UNVERIFIED','Implicit commit must never claim atomic guarantee');
foreach(array('_seogrow_elementor_text_enabled','_wp_page_template') as $key){
 reset_page($base);$pdo->prepare('DELETE FROM qa_postmeta WHERE meta_key=?')->execute(array($key));
 $result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
 check($result instanceof WP_Error&&$result->code==='ATOMIC_WRITE_UNAVAILABLE'&&live_data()===$base,'Opt-in and Canvas mandatory');
}
reset_page($base);$pdo->prepare("INSERT INTO qa_postmeta(post_id,meta_key,meta_value) VALUES(12,'_elementor_data',?)")->execute(array($base));
$result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
check($result instanceof WP_Error&&$result->code==='ATOMIC_WRITE_UNAVAILABLE','Duplicate meta refused');
reset_page($base);$GLOBALS['can_edit']=false;
$result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
check($result instanceof WP_Error&&$result->code==='ATOMIC_WRITE_FORBIDDEN','Object permission enforced');
$GLOBALS['can_edit']=true;
$pdo->exec('ALTER TABLE qa_postmeta ENGINE=MyISAM');
$result=seogrow_connector_atomic_write(new WP_REST_Request(payload($base,$target)));
check($result instanceof WP_Error&&$result->code==='ATOMIC_WRITE_UNAVAILABLE','Nontransactional storage refused');
$pdo->exec('DROP TABLE qa_postmeta');$pdo->exec('DROP TABLE qa_posts');
echo "Elementor text writer: validation, real MySQL locks, exact rollback and failure contracts passed. Native Elementor integration still requires the isolated site test.\n";
}
