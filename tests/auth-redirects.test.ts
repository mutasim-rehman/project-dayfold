import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({signInWithOAuth:vi.fn(),exchangeCodeForSession:vi.fn()}));
vi.mock("@/lib/supabase",()=>({userDb:async()=>({auth:mocks})}));
import {GET as login} from "../src/app/api/auth/google/route";
import {GET as callback} from "../src/app/auth/callback/route";
const origin="https://project-dayfold.vercel.app";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("VERCEL","1");vi.stubEnv("APP_URL","http://localhost:3000");});
afterEach(()=>vi.unstubAllEnvs());
describe("production OAuth redirect routes",()=>{
  it("sends the exact production callback to Supabase",async()=>{
    mocks.signInWithOAuth.mockResolvedValue({data:{url:"https://accounts.google.com/"},error:null});
    await login(new Request(`${origin}/api/auth/google`));
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({options:expect.objectContaining({redirectTo:`${origin}/auth/callback`})}));
  });
  it("canonicalizes preview hosts before creating the verifier",async()=>{
    const result=await login(new Request("https://preview.vercel.app/api/auth/google"));
    expect(result.headers.get("location")).toBe(`${origin}/api/auth/google`);
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });
  it.each([null,{code:"bad_code_verifier"}])("returns callback outcomes to production even with internal localhost URLs",async(error)=>{
    mocks.exchangeCodeForSession.mockResolvedValue({error});
    const result=await callback(new Request("http://localhost:3000/auth/callback?code=test-code"));
    expect(result.headers.get("location")).toBe(`${origin}/${error?"?auth_error=verification":""}`);
  });
  it("keeps provider exceptions on production",async()=>{
    mocks.signInWithOAuth.mockRejectedValue(new Error("unavailable"));
    const result=await login(new Request(`${origin}/api/auth/google`));
    expect(result.headers.get("location")).toBe(`${origin}/?auth_error=configuration`);
  });
});
