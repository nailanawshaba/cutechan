/**
 * Shared constants, should be used everywhere.
 */
// Don't import here anything!

// Selectors, must be kept in sync with markup and styles!
export const ALERTS_CONTAINER_SEL = ".alerts-container";
export const HOVER_CONTAINER_SEL = ".hover-container";
export const POPUP_CONTAINER_SEL = ".popup-container";
export const REPLY_CONTAINER_SEL = ".reply-container";
export const BOARD_SEARCH_INPUT_SEL = ".board-search-input";
export const BOARD_SEARCH_SORT_SEL = ".board-search-sort";
export const THREAD_SEL = ".thread";
export const POST_SEL = ".post";
export const POST_LINK_SEL = ".post-link";
export const POST_BODY_SEL = ".post-body";
export const POST_FILE_TITLE_SEL = ".post-file-title";
export const POST_FILE_LINK_SEL = ".post-file-link";
export const POST_FILE_THUMB_SEL = ".post-file-thumb";
export const POST_BACKLINKS_SEL = ".post-backlinks";
export const POST_EMBED_SEL = ".post-embed";
export const PAGE_NAV_TOP_SEL = ".page-nav-top";
export const PAGE_NAV_BOTTOM_SEL = ".page-nav-bottom";

// Action trigger selectors, might appear multiple times in markup.
export const TRIGGER_OPEN_REPLY_SEL = ".trigger-open-reply";
export const TRIGGER_QUOTE_POST_SEL = ".trigger-quote-post";
export const TRIGGER_DELETE_POST_SEL = ".trigger-delete-post";
export const TRIGGER_BAN_BY_POST_SEL = ".trigger-ban-by-post";
export const TRIGGER_MEDIA_POPUP_SEL = ".trigger-media-popup";
export const TRIGGER_PAGE_NAV_TOP_SEL = ".trigger-page-nav-top";
export const TRIGGER_PAGE_NAV_BOTTOM_SEL = ".trigger-page-nav-bottom";

// Constants.
export const ALERT_HIDE_TIMEOUT_SECS = 5;
export const RELATIVE_TIME_PERIOD_SECS = 60;
export const HOVER_TRIGGER_TIMEOUT_SECS = 0.1;
export const POST_HOVER_TIMEOUT_SECS = 0.5;
export const ZOOM_STEP_PX = 100;
export const HEADER_HEIGHT_PX = 30;
export const REPLY_THREAD_WIDTH_PX = 700;
export const REPLY_BOARD_WIDTH_PX = 1000;
export const REPLY_HEIGHT_PX = 200;
export const DEFAULT_NOTIFICATION_IMAGE_URL = "/static/img/notification.png";
const DAY_MS = 24 * 60 * 60 * 1000;
export const EMBED_CACHE_EXPIRY_MS = 30 * DAY_MS;
