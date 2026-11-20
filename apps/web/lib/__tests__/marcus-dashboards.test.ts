import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as catalog } from '@/app/api/integrations/marcus/dashboards/route';
import { GET as detail } from '@/app/api/integrations/marcus/dashboards/[id]/route';

const TOKEN='dashboard-test-token';
const request=(path:string)=>new Request(`http://localhost${path}`,{headers:{authorization:`Bearer ${TOKEN}`}});

describe('Marcus read-only dashboards',()=>{
  beforeEach(()=>vi.stubEnv('MARCUS_BEARER_TOKEN_HASH',createHash('sha256').update(TOKEN).digest('hex')));
  it('returns the bounded dashboard catalog',async()=>{
    const response=await catalog(request('/api/integrations/marcus/dashboards'));
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.dashboards.map((item:{id:string})=>item.id)).toEqual(expect.arrayContaining(['overview','projects','tasks','approvals','usage','swarms','finance','security','connected-apps']));
    expect(body.dashboards.find((item:{id:string})=>item.id==='projects').mode).toBe('live');
    expect(body.dashboards.find((item:{id:string})=>item.id==='finance').mode).toBe('link');
  });
  it('returns metadata for catalog-only dashboards without database access',async()=>{
    const response=await detail(request('/api/integrations/marcus/dashboards/finance'),{params:Promise.resolve({id:'finance'})});
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({id:'finance',mode:'link',path:'/dashboard/finance'});
  });
  it('rejects dashboard ids outside the allowlist before database access',async()=>{
    const response=await detail(request('/api/integrations/marcus/dashboards/secrets'),{params:Promise.resolve({id:'secrets'})});
    expect(response.status).toBe(404);
  });
});
