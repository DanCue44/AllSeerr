import { MediaStatus, MediaType } from '@server/constants/media';
import dataSource from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import type { BlocklistItem } from '@server/interfaces/api/blocklistInterfaces';
import { getMediaListBodyKey } from '@server/lib/mediaListKeys';
import { DbAwareColumn } from '@server/utils/DbColumnHelper';
import type { EntityManager } from 'typeorm';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity()
@Unique(['tmdbId', 'mediaType'])
@Unique(['mbId', 'mediaType'])
@Unique(['olId', 'mediaType'])
export class Blocklist implements BlocklistItem {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar' })
  public mediaType: MediaType;

  @Column({ nullable: true, type: 'varchar' })
  title?: string;

  // Albums and books have no TMDB id, they are keyed on mbId and olId
  @Column({ type: 'int', nullable: true })
  @Index()
  public tmdbId: number;

  @Column({ type: 'varchar', nullable: true })
  public mbId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public olId?: string | null;

  @ManyToOne(() => User, (user) => user.id, {
    eager: true,
  })
  @Index()
  user?: User;

  @OneToOne(() => Media, (media) => media.blocklist, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  public media: Media;

  @Column({ nullable: true, type: 'varchar' })
  public blocklistedTags?: string;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  constructor(init?: Partial<Blocklist>) {
    Object.assign(this, init);
  }

  public static async addToBlocklist(
    {
      blocklistRequest,
    }: {
      blocklistRequest: {
        mediaType: MediaType;
        title?: string;
        tmdbId?: number;
        mbId?: string;
        olId?: string;
        blocklistedTags?: string;
      };
    },
    entityManager?: EntityManager
  ): Promise<void> {
    const em = entityManager ?? dataSource;
    const key = getMediaListBodyKey(blocklistRequest);
    const blocklist = new this({
      ...blocklistRequest,
      ...key,
    });

    const mediaRepository = em.getRepository(Media);
    let media = await mediaRepository.findOne({
      where: {
        ...key,
        mediaType: blocklistRequest.mediaType,
      },
    });

    const blocklistRepository = em.getRepository(this);

    await blocklistRepository.save(blocklist);

    if (!media) {
      media = new Media({
        ...key,
        status: MediaStatus.BLOCKLISTED,
        status4k: MediaStatus.BLOCKLISTED,
        mediaType: blocklistRequest.mediaType,
        blocklist: Promise.resolve(blocklist),
      });
    } else {
      media.blocklist = Promise.resolve(blocklist);
      media.status = MediaStatus.BLOCKLISTED;
      media.status4k = MediaStatus.BLOCKLISTED;
    }

    // A blocklisted book can be requested in neither format
    if (blocklistRequest.mediaType === MediaType.BOOK) {
      media.statusAudio = MediaStatus.BLOCKLISTED;
    }

    await mediaRepository.save(media);
  }
}
