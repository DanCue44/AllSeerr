import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * What the OpenID Connect provider keeps between requests: sessions,
 * grants, codes and tokens, each as its model name and id
 */
@Entity('oidc_payload')
export class OidcPayload {
  @PrimaryColumn({ type: 'varchar' })
  public id: string;

  @PrimaryColumn({ type: 'varchar' })
  public model: string;

  @Column({ type: 'text' })
  public payload: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  public grantId?: string | null;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  public uid?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public userCode?: string | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public expiresAt?: Date | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public consumedAt?: Date | null;

  constructor(init?: Partial<OidcPayload>) {
    Object.assign(this, init);
  }
}
