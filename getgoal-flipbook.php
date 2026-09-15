<?php
/**
 * Plugin Name:       GETGOAL 3D Flipbook
 * Description:       A smooth, 3D page-flip book (StPageFlip + GSAP) for the "GetGoal Portfolio showcas". Use the [getgoal_flipbook] shortcode anywhere.
 * Version:           1.0.0
 * Author:            GetGoal Solutions
 * Text Domain:       getgoal-flipbook
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

/**
 * Everything lives in this one file on purpose:
 *  - PHP registers the shortcode, enqueues the pre-built /dist assets and
 *    prints the markup + the ordered image list for JS to consume.
 *  - The actual interactive behaviour (StPageFlip + GSAP) is bundled by
 *    Vite from /src into /dist/flipbook.js + /dist/flipbook.css.
 *    Run `npm install && npm run build` inside the plugin folder whenever
 *    /src changes; /dist is what ships to the browser.
 */
final class JIA_Flipbook_Plugin {

	const VERSION = '1.0.0';
	const SLUG    = 'jia-flipbook';

	/** @var self|null */
	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_shortcode( 'getgoal_flipbook', array( $this, 'render_shortcode' ) );
		add_shortcode( 'jia_flipbook', array( $this, 'render_shortcode' ) );
	}

	private function url( $path = '' ) {
		return plugin_dir_url( __FILE__ ) . ltrim( $path, '/' );
	}

	private function path( $path = '' ) {
		return plugin_dir_path( __FILE__ ) . ltrim( $path, '/' );
	}

	/**
	 * Enqueue the built JS/CSS on wp_enqueue_scripts so WordPress places
	 * them in <head> and <footer> during normal page rendering.
	 */
	public function enqueue_assets() {
		$css_file = $this->path( 'dist/flipbook.css' );
		$js_file  = $this->path( 'dist/flipbook.js' );

		$css_ver = file_exists( $css_file ) ? filemtime( $css_file ) : self::VERSION;
		$js_ver  = file_exists( $js_file ) ? filemtime( $js_file ) : self::VERSION;

		wp_enqueue_style(
			self::SLUG,
			$this->url( 'dist/flipbook.css' ),
			array(),
			$css_ver
		);

		// Vite builds this as an IIFE, so no ES module type / dependencies needed.
		wp_enqueue_script(
			self::SLUG,
			$this->url( 'dist/flipbook.js' ),
			array(),
			$js_ver,
			true
		);
	}

	/**
	 * Returns the ordered list of page media URLs.
	 * Reads supported page media from assets/images/page-NN.ext in numeric
	 * order, falling back gracefully if fewer/more files are present.
	 */
	private function get_page_images() {
		$dir = $this->path( 'assets/images' );
		$files = array();
		$cover = array();

		/*
		 * Keep this list aligned with the media types handled by the
		 * frontend. Support both lowercase and uppercase for Linux hosts.
		 */
		$extensions = array(
			'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'ogg', 'mov',
			'JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'MP4', 'WEBM', 'OGG', 'MOV',
		);

		/*
		 * The front cover is stored separately from numbered pages so it
		 * always appears first in the book, regardless of its filename.
		 */
		$cover_names = array( 'cover-page', 'cover_page', 'cover page', 'cover' );
		foreach ( $cover_names as $cover_name ) {
			foreach ( $extensions as $extension ) {
				$cover_file = $dir . '/' . $cover_name . '.' . $extension;
				if ( file_exists( $cover_file ) ) {
					$cover[] = $cover_file;
					break 2;
				}
			}
		}

		foreach ( $extensions as $extension ) {
			$matches = glob( $dir . '/page-*.' . $extension );

			if ( $matches ) {
				$files = array_merge( $files, $matches );
			}
		}

		if ( ! $files && ! $cover ) {
			return array();
		}

		natsort( $files );
		$files = array_merge( $cover, array_values( $files ) );

		$urls = array();
		foreach ( $files as $file ) {
			$urls[] = $this->url( 'assets/images/' . basename( $file ) );
		}

		return $urls;
	}

	/**
	 * Shortcode: [getgoal_flipbook width="1400"]
	 */
	public function render_shortcode( $atts ) {
		$atts = shortcode_atts(
			array(
				'width' => '1400', // max-width in px of the whole flipbook widget
				'ratio' => '1080:1920', // default page aspect ratio (1080x1920)
			),
			$atts,
			'getgoal_flipbook'
		);

		$images = $this->get_page_images();
		if ( empty( $images ) ) {
			return '<p class="jia-flipbook-error">' . esc_html__( 'GETGOAL Flipbook: no page images found in /assets/images.', 'getgoal-flipbook' ) . '</p>';
		}

		wp_enqueue_style( self::SLUG );
		wp_enqueue_script( self::SLUG );

		static $instance_count = 0;
		$instance_count++;
		$uid = 'jia-flipbook-' . $instance_count . '-' . wp_generate_password( 4, false, false );

		$max_width = absint( $atts['width'] );
		if ( $max_width < 300 ) {
			$max_width = 1400;
		}

		$total_pages = count( $images );
		$css_path    = $this->path( 'dist/flipbook.css' );
		$inline_css  = file_exists( $css_path ) ? file_get_contents( $css_path ) : '';
		$js_url      = $this->url( 'dist/flipbook.js' );
		$js_file     = $this->path( 'dist/flipbook.js' );
		$js_ver      = file_exists( $js_file ) ? filemtime( $js_file ) : self::VERSION;

		ob_start();

		// Inline the CSS so styling is 100% guaranteed on live WordPress,
		// completely immune to WP Rocket, caching plugins, or late head-enqueue issues.
		if ( ! empty( $inline_css ) ) {
			echo '<style id="getgoal-flipbook-core-css">' . $inline_css . '</style>';
		}
		?>
		<div
			id="<?php echo esc_attr( $uid ); ?>"
			class="jia-flipbook-wrap"
			style="max-width: <?php echo esc_attr( $max_width ); ?>px;"
			data-images='<?php echo esc_attr( wp_json_encode( $images ) ); ?>'
			data-aspect-ratio="<?php echo esc_attr( $atts['ratio'] ); ?>"
		>
			<div class="jia-flipbook-stage">
				<div class="jia-flipbook-book"></div>
			</div>

			<div class="jia-flipbook-toolbar">
				<button type="button" class="jia-fb-prev" aria-label="<?php esc_attr_e( 'Previous page', 'getgoal-flipbook' ); ?>">&#8249;</button>
				<div class="jia-fb-page-indicator">
					<span class="jia-fb-current">1</span> / <span class="jia-fb-total"><?php echo esc_html( $total_pages ); ?></span>
				</div>
				<button type="button" class="jia-fb-next" aria-label="<?php esc_attr_e( 'Next page', 'getgoal-flipbook' ); ?>">&#8250;</button>
				<button type="button" class="jia-fb-fullscreen" aria-label="<?php esc_attr_e( 'Toggle fullscreen', 'getgoal-flipbook' ); ?>">&#9974;</button>
			</div>

			<div class="jia-flipbook-loader jia-fb-hint">
				<div class="jia-fb-spinner"></div>
				<span><?php esc_html_e( 'Loading flipbook…', 'getgoal-flipbook' ); ?></span>
			</div>
		</div>

		<script id="getgoal-flipbook-bundle-js" src="<?php echo esc_url( $js_url . '?ver=' . $js_ver ); ?>"></script>
		<script>
		(function() {
			function initFlipbook() {
				if (typeof window.JIAFlipbookInit === 'function') {
					window.JIAFlipbookInit();
				}
			}
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', initFlipbook);
			} else {
				initFlipbook();
			}
			window.addEventListener('load', initFlipbook);
			if (window.jQuery) {
				window.jQuery(document).on('elementor/frontend/init', initFlipbook);
			}
		})();
		</script>
		<?php
		return ob_get_clean();
	}
}

JIA_Flipbook_Plugin::instance();
