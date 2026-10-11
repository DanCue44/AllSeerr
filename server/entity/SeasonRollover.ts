import { SeasonRolloverStatus } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import Media from './Media';
import { User } from './User';

const seasonNumbersTransformer = {
  from: (value: string | null): number[] => {
    try {
      return value ? JSON.parse(value) : [];
    } catch {
      return [];
    }
  },
  to: (value: number[] | undefined): string | undefined =>
    value === undefined ? undefined : JSON.stringify(value),
};

/**
 * A roll off of a current season request. Once a newer season starts, the
 * older seasons are only deleted after deleteAfter has passed, so admins have
 * a chance to keep them. See server/lib/seasonRollover.ts.
 */
@Entity()
class SeasonRollover {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'int', default: SeasonRolloverStatus.PENDING })
  @Index()
  public status: SeasonRolloverStatus;

  @Column({ default: false })
  public is4k: boolean;

  // The season whose start triggered the roll off
  @Column()
  public currentSeason: number;

  // Older seasons the request brought in, deleted once deleteAfter passes
  @Column({ type: 'text', transformer: seasonNumbersTransformer })
  public seasons: number[];

  // Older seasons that were already here, held until an admin approves
  // deleting them
  @Column({ type: 'text', transformer: seasonNumbersTransformer })
  public preexistingSeasons: number[];

  @Column({ default: false })
  public deletePreexisting: boolean;

  @DbAwareColumn({ type: 'datetime' })
  public deleteAfter: Date;

  @ManyToOne(() => Media, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @Index()
  public media: Media;

  @ManyToOne(() => User, {
    eager: true,
    onDelete: 'SET NULL',
    nullable: true,
  })
  public modifiedBy?: User | null;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<SeasonRollover>) {
    Object.assign(this, init);
  }
}

export default SeasonRollover;
