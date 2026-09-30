import {notFound} from "next/navigation";
import OperationsFixture from "./fixture";
export const dynamic="force-dynamic";
export default function Page(){if(process.env.NODE_ENV!=="development"||process.env.NEXT04_QA!=="1")notFound();return <OperationsFixture/>;}
