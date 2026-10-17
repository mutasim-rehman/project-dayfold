import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),profile:vi.fn()}));
vi.mock("@/lib/supabase",()=>({
  requireUser:mocks.requireUser,
  apiError:()=>Response.json({error:"Sign in to continue."},{status:401}),
  checkOrigin:vi.fn(),limitedJson:vi.fn(),rateLimit:vi.fn()
}));
import {GET} from "../src/app/api/me/route";
describe("verified account versus application profile",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.requireUser.mockResolvedValue({user:{id:"test-reader",email:"reader@example.invalid",user_metadata:{name:"Reader"}},db:{from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.profile})}),update:()=>({eq:async()=>({error:null})})})}});});
  it("keeps the account signed in if the application schema is not ready",async()=>{
    mocks.profile.mockResolvedValue({data:null,error:{code:"PGRST205"}});
    const response=await GET();const body=await response.json();expect(response.status).toBe(200);expect(body.user.name).toBe("Reader");expect(body.setup_required).toBe(true);expect(body.onboarding_complete).toBe(false);
  });
  it("still rejects an unverified session",async()=>{
    mocks.requireUser.mockRejectedValue(new Error("No verified identity"));const response=await GET();expect(response.status).toBe(401);expect(mocks.profile).not.toHaveBeenCalled();
  });
});
