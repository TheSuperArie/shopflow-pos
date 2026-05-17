import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { group_id } = body;

  if (!group_id) {
    return Response.json({ error: 'group_id is required' }, { status: 400 });
  }

  const [variants, groups] = await Promise.all([
    base44.asServiceRole.entities.FlexibleVariant.filter({ group_id }, '-created_date', 500),
    group_id ? base44.asServiceRole.entities.ProductGroup.list('name', 500) : Promise.resolve([]),
  ]);

  return Response.json({ variants, groups });
});