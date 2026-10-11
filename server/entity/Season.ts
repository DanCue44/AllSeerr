import { MediaStatus } from '@server/constants/media';
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

// Episode numbers are kept as a JSON string so both databases can store them
export const episodeNumbersTransformer = {
  from: (value: string | null): number[] | null => {
    try {
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },
  to: (value: number[] | null | undefined): string | null | undefined =>
    value === undefined ? undefined : value ? JSON.stringify(value) : null,
};

@Entity()
class Season {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  public seasonNumber: number;

  @Column({ type: 'int', default: MediaStatus.UNKNOWN })
  public status: MediaStatus;

  @Column({ type: 'int', default: MediaStatus.UNKNOWN })
  public status4k: MediaStatus;

  // Episode numbers last seen on the media server, used to detect new episodes
  @Column({
    type: 'text',
    nullable: true,
    transformer: episodeNumbersTransformer,
  })
  public availableEpisodes?: number[] | null;

  @Column({
    type: 'text',
    nullable: true,
    transformer: episodeNumbersTransformer,
  })
  public availableEpisodes4k?: number[] | null;

  @ManyToOne(() => Media, (media) => media.seasons, {
    onDelete: 'CASCADE',
  })
  @Index()
  public media: Promise<Media>;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({
    type: resolveDbType('datetime'),
    default: () => 'CURRENT_TIMESTAMP',
  })
  public updatedAt: Date;

  constructor(init?: Partial<Season>) {
    Object.assign(this, init);
  }
}

export default Season;
