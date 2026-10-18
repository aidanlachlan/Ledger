import { NextRequest } from "next/server";
import { exchangeCode } from "../exchange-code";
export const GET = (request: NextRequest) => exchangeCode(request, "/");
