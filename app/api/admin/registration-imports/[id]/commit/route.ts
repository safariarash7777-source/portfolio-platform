import {postSeasonal} from "@/lib/seasonal/http";
import {connectSeasonal} from "@/lib/seasonal/server";
export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return postSeasonal(req,connectSeasonal,"commit",(await params).id);}
