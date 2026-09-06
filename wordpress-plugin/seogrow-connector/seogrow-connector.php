<?php
/**
 * Plugin Name: SeoGrow Connector
 * Description: Espone a SeoGrow, tramite la REST API autenticata di WordPress, solo i campi necessari per Elementor, Rank Math e Yoast.
 * Version: 1.3.0
 * Author: SeoGrow AI
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/seogrow-connector-core.inc';
require_once __DIR__ . '/elementor-reference-read.php';
require_once __DIR__ . '/wordpress-public-inventory-paged.php';
require_once __DIR__ . '/taxonomy-diagnostics-read.php';
require_once __DIR__ . '/taxonomy-persistence-proof.php';
require_once __DIR__ . '/taxonomy-cache-coherence-capability.php';
require_once __DIR__ . '/taxonomy-public-cache-purge.php';
