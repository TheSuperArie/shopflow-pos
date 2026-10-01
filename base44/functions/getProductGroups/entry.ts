// Retired (security): this function returned any network's products to any signed-in user
// via the service role. Its only caller was the old orders screen, which is no longer routed.
Deno.serve(() => Response.json({ error: 'This function is no longer available' }, { status: 410 }));
