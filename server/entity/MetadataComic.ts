import type { ComicKind } from '@server/constants/media';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * What Talearr's comics lookup said about a series, kept so its page, its
 * requests and their notifications can show it. Talearr only looks series
 * up by name, so the answer is saved each time a series is found.
 */
@Entity()
class MetadataComic {
  @PrimaryGeneratedColumn()
  public id: number;

  // al-<AniList id> or hc-<Hardcover series id>
  @Column({ unique: true })
  public comicId: string;

  @Column({ type: 'varchar' })
  public kind: ComicKind;

  @Column({ type: 'varchar' })
  public title: string;

  @Column({ type: 'simple-json', nullable: true })
  public alternateTitles: string[] | null;

  @Column({ type: 'int', nullable: true })
  public year: number | null;

  // Publishing status, such as finished or releasing
  @Column({ type: 'varchar', nullable: true })
  public status: string | null;

  @Column({ type: 'int', nullable: true })
  public volumes: number | null;

  @Column({ type: 'varchar', nullable: true })
  public authors: string | null;

  @Column({ type: 'text', nullable: true })
  public overview: string | null;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl: string | null;

  // ComicInfo.xml rating, such as Teen, or Unknown
  @Column({ type: 'varchar', nullable: true })
  public ageRating: string | null;

  @Column({ default: false })
  public isAdult: boolean;

  @Column({ type: 'int', nullable: true })
  public aniListId: number | null;

  @Column({ type: 'int', nullable: true })
  public hardcoverSeriesId: number | null;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<MetadataComic>) {
    Object.assign(this, init);
  }
}

export default MetadataComic;
