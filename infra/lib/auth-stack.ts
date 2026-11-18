import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import {
  AccountRecovery,
  ClientAttributes,
  FeaturePlan,
  StringAttribute,
  UserPool,
  UserPoolEmail,
} from "aws-cdk-lib/aws-cognito";
import { EmailIdentity, Identity } from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";

export interface AuthStackProps extends StackProps {
  /** Address login codes are sent from. Must be verified in SES (AWS emails a link on first deploy). */
  senderEmail: string;
}

/**
 * Owner logins. Passwordless: owners type their email and get a one-time code.
 * Each user carries custom:business_id, which the API reads from the verified token.
 */
export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // SES identity for the sender address (sandbox: recipients must be verified too).
    new EmailIdentity(this, "SenderIdentity", { identity: Identity.email(props.senderEmail) });

    const pool = new UserPool(this, "Owners", {
      userPoolName: "1market-owners",
      featurePlan: FeaturePlan.ESSENTIALS, // needed for passwordless email codes
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      signInPolicy: { allowedFirstAuthFactors: { password: true, emailOtp: true } },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        business_id: new StringAttribute({ mutable: true, minLen: 1, maxLen: 64 }),
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      email: UserPoolEmail.withSES({
        fromEmail: props.senderEmail,
        fromName: "1Market",
        sesRegion: this.region,
      }),
      userVerification: {
        emailSubject: "Your 1Market code",
        emailBody: "Your 1Market sign-up code is {####}. It expires in 24 hours.",
      },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Owners can set their name/email; only the backend can set business_id.
    const client = pool.addClient("WebApp", {
      userPoolClientName: "1market-web",
      generateSecret: false,
      authFlows: { user: true, userSrp: true },
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      writeAttributes: new ClientAttributes().withStandardAttributes({ email: true, fullname: true }),
      readAttributes: new ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true, fullname: true })
        .withCustomAttributes("business_id"),
    });

    new CfnOutput(this, "UserPoolId", { value: pool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
  }
}
