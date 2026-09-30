import {postSeasonal} from "@/lib/seasonal/http";
import {connectSeasonal} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function POST(req:Request){return postSeasonal(req,connectSeasonal,"preview");}
