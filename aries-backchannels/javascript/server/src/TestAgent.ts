import { $log } from '@tsed/common'
import { Agent, AgentEventTypes, AgentMessageProcessedEvent, AutoAcceptCredential, AutoAcceptProof, CredentialsModule, DidsModule, InitConfig, MediatorModule, ProofsModule, V2CredentialProtocol, V2ProofProtocol } from '@aries-framework/core'
import { agentDependencies } from '@aries-framework/node'
import { AskarModule } from '@aries-framework/askar'
import { AnonCredsModule, LegacyIndyCredentialFormatService, LegacyIndyProofFormatService,  V1CredentialProtocol, V1ProofProtocol } from '@aries-framework/anoncreds'
import { AnonCredsRsModule } from '@aries-framework/anoncreds-rs'
import { IndyVdrAnonCredsRegistry, IndyVdrModule, IndyVdrSovDidResolver, IndyVdrPoolConfig } from '@aries-framework/indy-vdr'
import { IndySdkAnonCredsRegistry, IndySdkModule, IndySdkSovDidResolver, IndySdkPoolConfig } from '@aries-framework/indy-sdk'
import { TsedLogger } from './TsedLogger'
import { TransportConfig } from './TestHarnessConfig'
import indySdk from 'indy-sdk'
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
import { ariesAskar } from '@hyperledger/aries-askar-nodejs'
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'

export type TestAgent = Agent<ReturnType<typeof getLegacyIndySdkModules> | ReturnType<typeof getAskarAnonCredsIndyModules>>

export async function createAgent({
  genesisPath,
  agentName,
  transport,
  useLegacyIndySdk,
}: {
  genesisPath: string
  agentName: string
  transport: TransportConfig
  useLegacyIndySdk?: boolean
}) {
  const agentConfig: InitConfig = {
    label: agentName,
    walletConfig: {
      id: `aath-javascript-${Date.now()}`,
      key: '00000000000000000000000000000Test01',
    },
    endpoints: transport.endpoints,
    useDidSovPrefixWhereAllowed: true,
    logger: new TsedLogger($log),
  }

  const genesisTransactions = await new agentDependencies.FileSystem().read(genesisPath)

  const modules = useLegacyIndySdk ? getLegacyIndySdkModules({
    indyNamespace: 'main-pool',
    isProduction: false,
    genesisTransactions,
  }) : 
  getAskarAnonCredsIndyModules({
    indyNamespace: 'main-pool',
    isProduction: false,
    genesisTransactions,
  })

  const agent = new Agent({ config: agentConfig, dependencies: agentDependencies,
    modules
  })

  for (const it of transport.inboundTransports) {
    agent.registerInboundTransport(it)
  }

  for (const ot of transport.outboundTransports) {
    agent.registerOutboundTransport(ot)
  }

  await agent.initialize()

  // If at least a link secret is found, we assume there is a default one
  if ((await agent.modules.anoncreds.getLinkSecretIds()).length === 0) {
    await agent.modules.anoncreds.createLinkSecret()
  }


  agent.events.on(AgentEventTypes.AgentMessageProcessed, (data: AgentMessageProcessedEvent) => {
    agent.config.logger.debug(`Processed inbound message: ${JSON.stringify(data.payload.message.toJSON())}`)
  })

  return agent
}

export function getAskarAnonCredsIndyModules(indyNetworkConfig: IndyVdrPoolConfig) {
  const legacyIndyCredentialFormatService = new LegacyIndyCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyProofFormatService()

  return {
    mediator: new MediatorModule({
    // Needed to accept mediation requests: https://github.com/hyperledger/aries-framework-javascript/issues/668
    autoAcceptMediationRequests: true,
    }),
    credentials: new CredentialsModule({
      autoAcceptCredentials: AutoAcceptCredential.Never,
      credentialProtocols: [
        new V1CredentialProtocol({
          indyCredentialFormat: legacyIndyCredentialFormatService,
        }),
        new V2CredentialProtocol({
          credentialFormats: [legacyIndyCredentialFormatService],
        }),
      ],
    }),
    proofs: new ProofsModule({
      autoAcceptProofs: AutoAcceptProof.Never,
      proofProtocols: [
        new V1ProofProtocol({
          indyProofFormat: legacyIndyProofFormatService,
        }),
        new V2ProofProtocol({
          proofFormats: [legacyIndyProofFormatService],
        }),
      ],
    }),
    anoncreds: new AnonCredsModule({
      registries: [new IndyVdrAnonCredsRegistry()],
    }),
    anoncredsRs: new AnonCredsRsModule({ anoncreds }),
    indyVdr: new IndyVdrModule({
      indyVdr,
      networks: [indyNetworkConfig],
    }),
    dids: new DidsModule({
      resolvers: [new IndyVdrSovDidResolver()],
    }),
    askar: new AskarModule({ ariesAskar }),
  } as const
}

function getLegacyIndySdkModules(indyNetworkConfig: IndySdkPoolConfig) {
  const legacyIndyCredentialFormatService = new LegacyIndyCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyProofFormatService()

  return {
    mediator: new MediatorModule({
      // Needed to accept mediation requests: https://github.com/hyperledger/aries-framework-javascript/issues/668
      autoAcceptMediationRequests: true,
      }),  
    credentials: new CredentialsModule({
      autoAcceptCredentials: AutoAcceptCredential.Never,
      credentialProtocols: [
        new V1CredentialProtocol({
          indyCredentialFormat: legacyIndyCredentialFormatService,
        }),
        new V2CredentialProtocol({
          credentialFormats: [legacyIndyCredentialFormatService],
        }),
      ],
    }),
    proofs: new ProofsModule({
      autoAcceptProofs: AutoAcceptProof.Never,
      proofProtocols: [
        new V1ProofProtocol({
          indyProofFormat: legacyIndyProofFormatService,
        }),
        new V2ProofProtocol({
          proofFormats: [legacyIndyProofFormatService],
        }),
      ],
    }),
    anoncreds: new AnonCredsModule({
      registries: [new IndySdkAnonCredsRegistry()],
    }),
    indySdk: new IndySdkModule({
      indySdk,
      networks: [indyNetworkConfig],
    }),
    dids: new DidsModule({
      resolvers: [new IndySdkSovDidResolver()],
    }),
  } as const
}
