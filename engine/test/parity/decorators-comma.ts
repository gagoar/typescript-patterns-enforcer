import { UseInterceptors } from "x";
export class Up {
  @UseInterceptors(
    FileInterceptor("f", { limits: { fileSize: 4096 } }),
  )
  @Post("u", )
  upload(@Body(Pipe,) body: any) {}
}
