import { Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { PrivateSubnet } from 'aws-cdk-lib/aws-ec2';
import { ResourceContext, ResourceProvider } from "../spi";

/**
 * VPC resource provider 
 */
export class VpcProvider implements ResourceProvider<ec2.IVpc> {
    readonly vpcId?: string;
    readonly secondaryCidr?: string;
    readonly secondarySubnetCidrs?: string[];

    constructor(vpcId?: string, secondaryCidr?: string, secondarySubnetCidrs?: string[]) {
        this.vpcId = vpcId;
        this.secondaryCidr = secondaryCidr;
        this.secondarySubnetCidrs = secondarySubnetCidrs;
    }

    provide(context: ResourceContext): ec2.IVpc {
        const id = context.scope.node.id;
        let vpc = undefined;

        if (this.vpcId) {
            if (this.vpcId === "default") {
                console.log(`looking up completely default VPC`);
                vpc = ec2.Vpc.fromLookup(context.scope, id + "-vpc", { isDefault: true });
            } else {
                console.log(`looking up non-default ${this.vpcId} VPC`);
                vpc = ec2.Vpc.fromLookup(context.scope, id + "-vpc", { vpcId: this.vpcId });
            }
        }

        if (vpc == null) {
            // It will automatically divide the provided VPC CIDR range, and create public and private subnets per Availability Zone.
            // Network routing for the public subnets will be configured to allow outbound access directly via an Internet Gateway.
            // Network routing for the private subnets will be configured to allow outbound access via a set of resilient NAT Gateways (one per AZ).
            // Creates Secondary CIDR and Secondary subnets if passed.
            vpc = new ec2.Vpc(context.scope, id + "-vpc");
            const secondarySubnets: Array<PrivateSubnet> = [];
            if (this.secondaryCidr) {
                new ec2.CfnVPCCidrBlock(context.scope, id + "-secondaryCidr", {
                    vpcId: vpc.vpcId,
                    cidrBlock: this.secondaryCidr});
                if (this.secondarySubnetCidrs) {
                    for(let az in vpc.availabilityZones) {
                        secondarySubnets[az] = new ec2.PrivateSubnet(context.scope, id + "private-subnet-" + vpc.availabilityZones[az], {
                            availabilityZone: vpc.availabilityZones[az],
                            cidrBlock: this.secondarySubnetCidrs[az],
                            vpcId: vpc.vpcId});
                    }
                    for(let secondarySubnet of secondarySubnets) {
                        Tags.of(secondarySubnet).add("kubernetes.io/role/internal-elb", "1", { applyToLaunchedInstances: true });
                        Tags.of(secondarySubnet).add("Name", `blueprint-construct-dev-PrivateSubnet-${secondarySubnet}`, { applyToLaunchedInstances: true });
                    }
                }
            }
        }
        return vpc;
    }
}

export class DirectVpcProvider implements ResourceProvider<ec2.IVpc> {
     constructor(readonly vpc: ec2.IVpc) { }

    provide(_context: ResourceContext): ec2.IVpc {
        return this.vpc;
    }    
}