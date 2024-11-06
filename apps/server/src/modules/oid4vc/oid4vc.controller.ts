import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeController,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { v4 as uuidv4 } from 'uuid';
import { wsServer } from '../../main';
import { IdentityService } from '../../services/identity.service';
import { UserSession } from '../../decorators/UserSession';
import { Session } from '../../entities';
import { SiopOfferService } from './siopOffer.service';
import { CredOfferService } from './credOffer.service';
import { UsersService } from '../users/users.service';
import { SessionsService } from '../users/sessions.service';
import {
  SiopOfferDTO,
  TokenResponseDTO,
  TokenRequestDTO,
  CredOfferDTO,
  BaseCredOfferDTO,
  SiopRequestDTO,
} from '@repo/dtos';
import { Serialize } from 'src/middlewares/interceptors/serialize.interceptors';
import { Request } from 'express';
import { getResolver } from 'src/utils';
import { stat } from 'fs';

const presentationDefinition = {
  id: 'exampleCredRequest',
  purpose:
    "To gather all available verifiable credentials from the holder's wallet",
  input_descriptors: [
    {
      id: `credRequest`,
      constraints: {
        fields: [
          {
            path: ['$.vc.type'],
            filter: {
              type: 'array',
              contains: {
                type: 'string',
                pattern: 'Participation Badge',
              },
            },
          },
        ],
      },
    },
  ],
};

@ApiTags('OpenID')
@ApiExcludeController()
@Controller('oid4vc')
export class Oid4vcController {
  constructor(
    private identityService: IdentityService,
    private siopOfferService: SiopOfferService,
    private credOfferService: CredOfferService,
  ) {}

  @Serialize(SiopOfferDTO)
  @ApiOkResponse({ type: SiopOfferDTO })
  @Get('/siop')
  async newSiopRequest(@UserSession() session: Session) {
    const state = session.id;
    const siopRequest = await (
      await this.identityService.getAdminDid()
    ).rp.createRequest({
      state,
      requestBy: 'reference',
      requestUri: new URL(
        `/api/oid4vc/siop/${session.id}`,
        process.env.PUBLIC_BASE_URI,
      ).toString(),
      responseType: 'id_token',
    });

    const offerExists = await this.siopOfferService.findById(session.id);
    if (offerExists) {
      await this.siopOfferService.findByIdAndUpdate(session.id, {
        request: siopRequest.request,
      });
    } else {
      await this.siopOfferService.create({
        id: session.id,
        request: siopRequest.request,
      });
    }
    return siopRequest;
  }

  @Serialize(SiopOfferDTO)
  @ApiOkResponse({ type: SiopOfferDTO })
  @Get('/pex')
  async newPex(@UserSession() session: Session) {
    const state = session.id;
    let siopRequest = await (
      await this.identityService.getAdminDid()
    ).rp.createRequest({
      state,
      requestBy: 'reference',
      requestUri: new URL(
        `/api/oid4vc/siop/${session.id}`,
        process.env.PUBLIC_BASE_URI,
      ).toString(),
      responseType: 'vp_token',
      presentationDefinition,
    });

    const offerExists = await this.siopOfferService.findById(session.id);
    if (offerExists) {
      await this.siopOfferService.findByIdAndUpdate(session.id, {
        request: siopRequest.request,
      });
    } else {
      await this.siopOfferService.create({
        id: session.id,
        request: siopRequest.request,
      });
    }
    return siopRequest;
  }

  @ApiOkResponse({ type: String })
  @ApiNotFoundResponse({ type: NotFoundException })
  @Get('/siop/:id')
  async getSiopRequestById(@Param('id') id: string) {
    const { request } = await this.siopOfferService.findById(id);
    return request;
  }

  @Serialize(TokenResponseDTO)
  @Post('/token')
  @ApiOkResponse({ type: TokenResponseDTO })
  @ApiNotFoundResponse({ type: NotFoundException })
  @ApiInternalServerErrorResponse({ type: InternalServerErrorException })
  async tokenEndpoint(
    @Param('identity') identity: string,
    @Body() body: TokenRequestDTO,
  ) {
    const { issuer } = await this.identityService.getAdminDid();
    const response = await issuer.createTokenResponse(body);
    return response;
  }

  @Serialize(CredOfferDTO)
  @ApiOkResponse({ type: CredOfferDTO })
  @ApiNotFoundResponse({ type: NotFoundException })
  @Get('/credentials/offer')
  async createCredentialOffer(@UserSession() session: Session) {
    // Fill the crdential name here or create logic to fill it out :)
    const { issuer } = await this.identityService.getAdminDid();

    const offer = await issuer.createCredentialOffer(
      {
        credentials: ['ExampleBadge'],
        requestBy: 'reference',
        credentialOfferUri: new URL(
          `/api/oid4vc/offers/${session.id}`,
          process.env.PUBLIC_BASE_URI,
        ).toString(),
        pinRequired: false,
      },
      {
        state: session.id,
      },
    );
    const offerExists = await this.credOfferService.findById(session.id);
    if (!offerExists) {
      await this.credOfferService
        .create({ id: session.id, offer: offer.offer })
        .catch(() => null);
    } else {
      await this.credOfferService.findByIdAndUpdate(session.id, {
        offer: offer.offer,
      });
    }
    return offer;
  }

  @Serialize(BaseCredOfferDTO)
  @Get('/offers/:id')
  @ApiOkResponse({ type: BaseCredOfferDTO })
  @ApiNotFoundResponse({ type: NotFoundException })
  async getCredOffer(@Param('id') id: string) {
    const { offer } = await this.credOfferService.findById(id);
    return offer;
  }

  @Post('/credential')
  async sendCredential(@Req() req: Request) {
    const didJWT = await import('did-jwt');
    const token = req.headers.authorization?.split('Bearer ')[1];
    const resolver = await getResolver();
    if (!token) throw new UnauthorizedException('No token');
    const { payload } = await didJWT.verifyJWT(token, {
      policies: { aud: false },
      resolver,
    });

    const identity = await this.identityService.getAdminDid();

    const did = await identity.issuer.validateCredentialsResponse({
      token,
      proof: req.body.proof.jwt,
    });

    /**
     * UNCOMMENT THIS FOR BADGE
     */

    const badgeName: string = 'ExampleBadge';
    const verifiableCredential = await identity.account.credentials.createBadge(
      {
        recipientDid: did,
        body: {},
        description: '',
        badgeName,
        criteria: '',
        image: 'https://app.auvo.io/images/Logo.png',
        id: new URL(
          `/credentials/${uuidv4()}`,
          process.env.PUBLIC_BASE_URI,
        ).toString(),
        keyIndex: 0,
        issuerName: 'ExampleOrg',
        type: badgeName,
      },
    );
    const response = await identity.issuer.createSendCredentialsResponse({
      credentials: [verifiableCredential.cred],
    });

    wsServer.broadcast(payload.state, { credential: true });
    return response;

    /**
     * UNCOMMENT THIS FOR VEFIFIABLE CREDENTIAL
     */

    // const verifiableCredential = await identity.account.credentials.create({
    //   recipientDid: did,
    //   body: { },
    //   id: `urn:uuid:${uuidv4()}`,
    //   keyIndex: 0,
    //   type: credentialName,
    // });
    // const response = await identity.issuer.createSendCredentialsResponse({
    //   credentials: [verifiableCredential.cred],
    // });

    // wsServer.broadcast(payload.state, { credential: true });
    // return response;
  }

  @Post('/auth')
  async verifyAuthResponse(@Body() body: any) {
    const { state } = body;
    console.log(state);

    const { id_token: idToken, vp_token: vpToken } = body;
    const { rp } = await this.identityService.getAdminDid();
    console.log(state);
    if (idToken) {
      await rp.verifyAuthResponse(body);
      const { iss } = await rp.validateJwt(idToken);
    } else if (vpToken) {
      await rp.verifyAuthResponse(body, presentationDefinition);
      const { iss } = await rp.validateJwt(vpToken);
      wsServer.broadcast(state, { success: true });
    }
  }
}
