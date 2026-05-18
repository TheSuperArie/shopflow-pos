import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const tenantEmail = body.tenant_email || null;

  const groups = tenantEmail
    ? await base44.asServiceRole.entities.ProductGroup.filter({ created_by: tenantEmail }, 'name', 500)
    : await base44.asServiceRole.entities.ProductGroup.list('name', 500);

  return Response.json({ groups });
});