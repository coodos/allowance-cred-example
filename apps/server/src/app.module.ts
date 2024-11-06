import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './db/data-source';
import { UsersModule } from './modules/users/users.module';
import { Oid4vcModule } from './modules/oid4vc/oid4vc.module';
import { GlobalModule } from './modules/global/global.module';
import { WellKnownModule } from './modules/well-known/well-known.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CurrentUserInterceptor } from './guards/auth.guard';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    UsersModule,
    Oid4vcModule,
    GlobalModule,
    WellKnownModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CurrentUserInterceptor,
    },
  ],
})
export class AppModule {}
