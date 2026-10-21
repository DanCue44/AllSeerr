import type { AgeLimit } from '@server/lib/userAccess/ageLimits';
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';

/**
 * A person's age limit, set once and passed on to every app that can
 * restrict content by age
 */
@Entity('user_access_profile')
export class UserAccessProfile {
  @PrimaryGeneratedColumn()
  public id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn()
  public user: User;

  // none or missing means no limit
  @Column({ type: 'varchar', nullable: true })
  public ageLimit?: AgeLimit | null;

  // Whether content without an age rating is shown under a limit
  @Column({ type: 'boolean', default: false })
  public includeUnrated: boolean;

  constructor(init?: Partial<UserAccessProfile>) {
    Object.assign(this, init);
  }
}
