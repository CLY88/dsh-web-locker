/** Host half of the Web Locker bundle.
 *
 * The locker is a pure client-side screen-occlusion overlay: it covers the
 * whole Web UI after a configurable idle period (or on a manual action from
 * the sidebar) so a passer-by cannot read the screen. Visibility does not
 * touch Host runtime, session log, or Agent tool execution — background work
 * keeps running while the screen is covered. The Host half therefore only
 * declares the patch row and its Config; all behavior lives in ./client.js.
 */
export function apply() {}
