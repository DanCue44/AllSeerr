import type {
  UserAccessApp,
  UserAppAccountGrant,
} from '@server/constants/userAccess';
import { UserAppAccountStatus } from '@server/constants/userAccess';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './User';

/**
 * A person's access to an app Allseerr manages accounts in, such as
 * Audiobookshelf, Kavita or Komga, and the account it made there
 */
@Entity('user_app_account')
@Unique('UQ_user_app_account_user_app', ['user', 'app'])
export class UserAppAccount {
  @PrimaryGeneratedColumn()
  public id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @Index()
  public user: User;

  @Column({ type: 'varchar' })
  public app: UserAccessApp;

  // Whether the person may use the app
  @Column({ type: 'boolean', default: false })
  public enabled: boolean;

  // Libraries in the app the person may open, null for all of them
  @Column({ type: 'simple-json', nullable: true })
  public libraryIds?: string[] | null;

  // The account in the app, once Allseerr has made or found it
  @Column({ type: 'varchar', nullable: true })
  public remoteUserId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public remoteUsername?: string | null;

  // admin for a choice made for this person, plex for the default access
  // given to everyone with access to the Plex server. Older rows have none
  // and count as an admin's choice.
  @Column({ type: 'varchar', nullable: true })
  public grantedBy?: UserAppAccountGrant | null;

  @Column({ type: 'varchar', default: UserAppAccountStatus.NONE })
  public status: UserAppAccountStatus;

  @Column({ type: 'text', nullable: true })
  public lastError?: string | null;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public syncedAt?: Date | null;

  // When the person asked an admin for access from their Reading apps
  // settings, until an admin answers by turning access on or off
  @DbAwareColumn({ type: 'datetime', nullable: true })
  public accessRequestedAt?: Date | null;

  // The key Allseerr made in the app for NoBookEnds to sign in with, kept so
  // every device of the person gets the same one. Never sent to the pages.
  @Column({ type: 'text', nullable: true, select: false })
  public nobookendsToken?: string | null;

  // The app's id for that key, to remove it when it stops working
  @Column({ type: 'varchar', nullable: true })
  public nobookendsTokenId?: string | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<UserAppAccount>) {
    Object.assign(this, init);
  }
}
