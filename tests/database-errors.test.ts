import {describe,it,expect,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {databaseError,apiError,rateLimit} from "../src/lib/supabase";
describe("incomplete Dayfold database",()=>{
  it("explains missing schema without exposing provider details",async()=>{
    for(const code of ["PGRST202","PGRST204","PGRST205","42703"]){
      const response=apiError(databaseError({code,message:"private database details"}));
      expect(response.status).toBe(503);const body=await response.json();
      expect(body.error).toContain("Dayfold account setup is incomplete");expect(body.error).not.toContain("private database details");
    }
  });
  it("fails closed when the rate-limit function is missing",async()=>{
    const db={rpc:vi.fn().mockResolvedValue({data:null,error:{code:"PGRST202"}})};
    await expect(rateLimit(db as never,"preferences",60)).rejects.toThrow("Dayfold account setup is incomplete");
  });
  it("keeps unrelated database errors private",async()=>{
    const response=apiError(databaseError({code:"other",message:"private"}));
    expect(response.status).toBe(503);expect((await response.json()).error).not.toContain("private");
  });
});
