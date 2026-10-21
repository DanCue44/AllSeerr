import type { UserAccessApp } from '@server/constants/userAccess';
import type { AgeLimit } from '@server/lib/userAccess/ageLimits';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';

// The libraries an invite opens in each app, null for all of them
export type InviteApps = Partial<
  Record<UserAccessApp, { libraryIds: string[] | null }>
>;

/**
 * A link that lets someone sign in with Plex and get the apps the admin
 * picked. Only the hash of the link's token is kept.
 */
@Entity('access_invite')
export class AccessInvite {
  @PrimaryGeneratedColumn()
  public id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', select: false })
  public tokenHash: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  public createdBy?: User | null;

  // Who the invite is for, shown to the admin only
  @Column({ type: 'varchar', nullable: true })
  public label?: string | null;

  @Column({ type: 'simple-json' })
  public apps: InviteApps;

  @Column({ type: 'varchar', nullable: true })
  public ageLimit?: AgeLimit | null;

  @Column({ type: 'boolean', default: false })
  public includeUnrated: boolean;

  @DbAwareColumn({ type: 'datetime' })
  public expiresAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public redeemedAt?: Date | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  public redeemedBy?: User | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public revokedAt?: Date | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<AccessInvite>) {
    Object.assign(this, init);
  }
}
