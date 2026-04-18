"use client";

import {
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Edit3,
  MessageSquare,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import React, { useEffect, useRef, useState } from "react";

import { UserAvatar } from "@/components/shared/avatar-display";
import RichTextEditor from "@/components/shared/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppClientTranslations } from "@/hooks/use-translations";
import { getActivityLogs } from "@/lib/actions/activity-logs.action";
import {
  createNewComment,
  getCommentsForEntity,
} from "@/lib/actions/comments.action";
import { getTicketStateChangesHistory } from "@/lib/actions/teams.action";
import {
  formatDateTime,
  formatDateTimeDistanceToNow,
  formatDateTimeFull,
  isToday,
  isYesterday,
} from "@/lib/datetime";
import { obfuscate } from "@/lib/endecode";
import { useError } from "@/providers/error-provider";
import { ActivityLogDTO } from "@/types/activity-logs";
import { CommentDTO, EntityType } from "@/types/commons";
import { TransitionItemDTO } from "@/types/teams";

type ActivityType = "comment" | "field-change" | "state-transition";

interface UnifiedActivityItem {
  id: string;
  type: ActivityType;
  timestamp: Date;
  timestampStr: string;
  actorName: string;
  actorId: number;
  actorImageUrl: string;
  content: React.ReactNode;
  rawContent?: string;
  hasLongContent?: boolean;
  isNew?: boolean;
}

type UnifiedActivityTimelineProps = {
  entityType: EntityType;
  entityId: number;
};

const STATE_TRANSITION_ICONS: Record<string, React.ReactNode> = {
  Completed: <RefreshCw className="h-4 w-4 text-emerald-500" />,
  Overdue: <Clock className="h-4 w-4 text-red-500" />,
  Escalated: <TrendingUp className="h-4 w-4 text-orange-500" />,
};

const STATE_TRANSITION_BADGES: Record<string, string> = {
  Completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  Overdue: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  Escalated:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
};

const ACTIVITY_TYPE_CONFIG: Record<
  ActivityType,
  { icon: React.ReactNode; color: string; label: string }
> = {
  comment: {
    icon: <MessageSquare className="h-3 w-3" />,
    color: "border-blue-500 text-blue-500",
    label: "评论",
  },
  "field-change": {
    icon: <Edit3 className="h-3 w-3" />,
    color: "border-amber-500 text-amber-500",
    label: "变更",
  },
  "state-transition": {
    icon: <RefreshCw className="h-3 w-3" />,
    color: "border-emerald-500 text-emerald-500",
    label: "状态",
  },
};

const CollapsibleContent: React.FC<{
  content: string;
  maxHeight?: number;
}> = ({ content, maxHeight = 180 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [needsCollapse, setNeedsCollapse] = useState(false);

  const checkHeight = React.useCallback(() => {
    if (contentRef.current) {
      const scrollHeight = contentRef.current.scrollHeight;
      setNeedsCollapse(scrollHeight > maxHeight);
    }
  }, [maxHeight]);

  useEffect(() => {
    checkHeight();
    const timer = setTimeout(checkHeight, 100);
    return () => clearTimeout(timer);
  }, [content, checkHeight]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={[
          "text-sm leading-snug text-foreground",
          "[&>div]:m-0 [&>div]:p-0",
          "[&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:mt-1 [&_table]:table-fixed",
          "[&_thead]:bg-muted/60",
          "[&_th]:text-left [&_th]:font-semibold [&_th]:px-3 [&_th]:py-1.5 [&_th]:border [&_th]:border-border [&_th]:text-muted-foreground",
          "[&_th:nth-child(1)]:w-1/5",
          "[&_th:nth-child(2)]:w-2/5",
          "[&_th:nth-child(3)]:w-2/5",
          "[&_td]:px-3 [&_td]:py-1.5 [&_td]:border [&_td]:border-border [&_td]:align-top [&_td]:break-words",
          "[&_tbody_tr:nth-child(even)]:bg-muted/30",
          "[&_tbody_tr:hover]:bg-muted/50",
          "[&_td_p]:m-0 [&_td_p]:p-0",
          "transition-all duration-300 ease-in-out",
        ].join(" ")}
        style={
          !isExpanded && needsCollapse
            ? { maxHeight: `${maxHeight}px`, overflow: "hidden" }
            : {}
        }
        dangerouslySetInnerHTML={{
          __html: content.replace(
            /(<td[^>]*>)([\s\S]*?)(<\/td>)/g,
            (_, open, content, close) =>
              `${open}${content
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")}${close}`,
          ),
        }}
      />
      {!isExpanded && needsCollapse && (
        <div
          className="absolute left-0 right-0 h-16 pointer-events-none transition-opacity duration-300"
          style={{
            bottom: 0,
            background:
              "linear-gradient(to top, var(--background) 0%, transparent 100%)",
          }}
        />
      )}
      {needsCollapse && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-6 text-xs text-muted-foreground hover:text-foreground transition-all duration-200"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1 transition-transform duration-200" />
              收起
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1 transition-transform duration-200" />
              展开查看详情
            </>
          )}
        </Button>
      )}
    </div>
  );
};

const TimeDisplay: React.FC<{ date: Date | string }> = ({ date }) => {
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  const relative = formatDateTimeDistanceToNow(parsedDate);
  const full = formatDateTimeFull(parsedDate);

  let label = relative;
  if (isToday(parsedDate)) {
    const timeStr = parsedDate.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    label = `今天 ${timeStr}`;
  } else if (isYesterday(parsedDate)) {
    const timeStr = parsedDate.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    label = `昨天 ${timeStr}`;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs text-muted-foreground cursor-default hover:text-foreground transition-colors">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="text-xs">
        <div className="font-medium">{full}</div>
        <div className="text-muted-foreground">{relative}</div>
      </TooltipContent>
    </Tooltip>
  );
};

const ActivityGroupHeader: React.FC<{ date: Date }> = ({ date }) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  let label = "";
  if (isSameDay(date, today)) {
    label = "今天";
  } else if (isSameDay(date, yesterday)) {
    label = "昨天";
  } else {
    label = date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  }

  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-medium text-muted-foreground px-2.5 py-0.5 bg-muted/50 rounded-full">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="flex flex-col gap-4">
    <div className="flex gap-3 items-start">
      <div className="shrink-0 pt-1">
        <Skeleton className="w-8 h-8 rounded-full" />
      </div>
      <div className="flex-1 space-y-2">
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="flex justify-end">
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
    </div>
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="flex flex-col items-center shrink-0">
            <Skeleton className="w-6 h-6 rounded-full" />
            {i < 2 && <div className="w-px flex-1 bg-border min-h-8" />}
          </div>
          <div className="flex-1 space-y-2 py-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-4 w-12 rounded" />
              <div className="flex-1" />
              <Skeleton className="h-3 w-16 rounded" />
            </div>
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-sm">
    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
      <Clock className="h-8 w-8 text-muted-foreground/50" />
    </div>
    <div className="text-center">
      <p className="font-medium text-foreground">暂无活动记录</p>
      <p className="text-xs text-muted-foreground mt-1">
        评论、状态变更和字段修改将显示在这里
      </p>
    </div>
  </div>
);

const UnifiedActivityTimeline: React.FC<UnifiedActivityTimelineProps> = ({
  entityType,
  entityId,
}) => {
  const { data: session } = useSession();
  const t = useAppClientTranslations();
  const { setError } = useError();
  const timelineRef = useRef<HTMLDivElement>(null);

  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogDTO[]>([]);
  const [stateTransitions, setStateTransitions] = useState<
    TransitionItemDTO[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [unifiedItems, setUnifiedItems] = useState<UnifiedActivityItem[]>([]);
  const [newlyAddedCommentId, setNewlyAddedCommentId] = useState<
    string | null
  >(null);

  const [newComment, setNewComment] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const [commentsData, activityData, transitionsData] =
          await Promise.all([
            getCommentsForEntity(entityType, entityId, setError),
            getActivityLogs("Ticket", entityId, 1, 100, setError),
            getTicketStateChangesHistory(entityId, setError),
          ]);

        setComments(commentsData || []);
        setActivityLogs(activityData?.content || []);
        setStateTransitions(transitionsData?.transitions || []);
      } catch (err) {
        console.error("Failed to fetch activity data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [entityType, entityId, setError]);

  useEffect(() => {
    const items: UnifiedActivityItem[] = [];

    comments.forEach((comment) => {
      if (!comment.createdAt) return;
      items.push({
        id: `comment-${comment.id}`,
        type: "comment",
        timestamp: new Date(comment.createdAt),
        timestampStr: comment.createdAt,
        actorName: comment.createdByName || "Unknown",
        actorId: comment.createdById,
        actorImageUrl: comment.createdByImageUrl || "",
        content: null as unknown as React.ReactNode,
        rawContent: comment.content,
        isNew: newlyAddedCommentId === `comment-${comment.id}`,
      });
    });

    activityLogs.forEach((log) => {
      items.push({
        id: `log-${log.id}`,
        type: "field-change",
        timestamp: new Date(log.createdAt),
        timestampStr: log.createdAt,
        actorName: log.createdByName || "System",
        actorId: log.createdById,
        actorImageUrl: log.createdByImageUrl || "",
        content: null as unknown as React.ReactNode,
        rawContent: log.content || "",
        hasLongContent: true,
      });
    });

    stateTransitions.forEach((transition, index) => {
      items.push({
        id: `transition-${index}`,
        type: "state-transition",
        timestamp: new Date(transition.transitionDate),
        timestampStr: transition.transitionDate,
        actorName: "System",
        actorId: 0,
        actorImageUrl: "",
        content: (
          <StateTransitionContent transition={transition} t={t as any} />
        ),
      });
    });

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    setUnifiedItems(items);
  }, [comments, activityLogs, stateTransitions, t, newlyAddedCommentId]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const newCommentObj: CommentDTO = {
      content: newComment,
      createdById: Number(session?.user?.id!),
      entityType,
      entityId,
    };
    setSubmitting(true);
    try {
      const savedComment = await createNewComment(newCommentObj, setError);
      savedComment.createdByName =
        `${session?.user?.firstName ?? ""} ${session?.user?.lastName ?? ""}`.trim();
      savedComment.createdByImageUrl = session?.user?.imageUrl || "";

      if (!savedComment.createdAt) {
        savedComment.createdAt = new Date().toISOString();
      }

      if (!savedComment.id) {
        (savedComment as any).id = Date.now();
      }

      const tempId = `comment-${savedComment.id}`;
      setNewlyAddedCommentId(tempId);

      setComments((prev) => [savedComment, ...prev]);
      setNewComment("");

      setTimeout(() => {
        setNewlyAddedCommentId(null);
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const groupByDate = (items: UnifiedActivityItem[]) => {
    const groups: {
      dateKey: string;
      date: Date;
      items: UnifiedActivityItem[];
    }[] = [];

    items.forEach((item) => {
      const date = item.timestamp;
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      const existingGroup = groups.find((g) => g.dateKey === dateKey);
      if (existingGroup) {
        existingGroup.items.push(item);
      } else {
        groups.push({
          dateKey,
          date,
          items: [item],
        });
      }
    });

    return groups;
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  const groups = groupByDate(unifiedItems);

  return (
    <div className="flex flex-col gap-6" ref={timelineRef}>
      <div className="flex gap-3 items-start">
        <div className="shrink-0 pt-1">
          <UserAvatar imageUrl={session?.user?.imageUrl} size="w-8 h-8" />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <RichTextEditor
            value={newComment}
            onChange={(value) => setNewComment(value)}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleAddComment}
              disabled={submitting || !newComment.trim()}
              className="transition-all duration-200"
            >
              {submitting
                ? t.common.buttons("submitting")
                : t.common.buttons("add_comment")}
            </Button>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="relative">
          {groups.map((group) => (
            <React.Fragment key={group.dateKey}>
              <ActivityGroupHeader date={group.date} />
              <div className="space-y-0">
                {group.items.map((item, itemIndex) => (
                  <ActivityItem
                    key={item.id}
                    item={item}
                    isLast={itemIndex === group.items.length - 1}
                    session={session}
                    t={t as any}
                  />
                ))}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

const ActivityItem: React.FC<{
  item: UnifiedActivityItem;
  isLast: boolean;
  session: any;
  t: any;
}> = ({ item, isLast, session, t }) => {
  const config = ACTIVITY_TYPE_CONFIG[item.type];
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (item.isNew && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const isInViewport =
        rect.top >= 0 &&
        rect.bottom <=
          (window.innerHeight || document.documentElement.clientHeight);

      if (!isInViewport) {
        itemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [item.isNew]);

  return (
    <div
      ref={itemRef}
      className={[
        "relative flex gap-3 pl-9 py-3 group transition-all duration-300 rounded-md -mx-2 px-2 border-l-2",
        item.isNew
          ? "bg-primary/5 border-l-primary"
          : "border-l-transparent hover:bg-muted/30",
      ].join(" ")}
    >
      <div className="absolute left-0 top-3 z-10 flex flex-col items-center">
        <div
          className={[
            "flex items-center justify-center w-6 h-6 rounded-full border-2 z-10 bg-background transition-colors",
            config.color,
          ].join(" ")}
        >
          {config.icon}
        </div>
        {!isLast && (
          <div className="w-px flex-1 bg-border my-1 min-h-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm mb-1">
          {item.actorId > 0 ? (
            <div className="flex items-center gap-1.5">
              <UserAvatar
                imageUrl={item.actorImageUrl}
                size="w-5 h-5"
              />
              <Link
                href={`/portal/users/${obfuscate(item.actorId)}`}
                className="font-medium hover:text-primary hover:underline underline-offset-4 transition-colors"
              >
                {item.actorName}
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                <Circle className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
              <span className="font-medium text-muted-foreground">
                {item.actorName}
              </span>
            </div>
          )}

          <Badge
            variant="outline"
            className={[
              "text-xs px-1.5 py-0 h-5 font-normal border-dashed",
              item.type === "comment"
                ? "border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400"
                : item.type === "field-change"
                  ? "border-amber-200 text-amber-600 dark:border-amber-800 dark:text-amber-400"
                  : "border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400",
            ].join(" ")}
          >
            {config.label}
          </Badge>

          {item.isNew && (
            <Badge
              variant="default"
              className="text-xs px-1.5 py-0 h-5 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-transparent animate-pulse"
            >
              新
            </Badge>
          )}

          <div className="ml-auto">
            <TimeDisplay date={item.timestamp} />
          </div>
        </div>

        <div className="mt-1">
          {item.type === "comment" && item.rawContent && (
            <div
              className={[
                "rounded-lg border bg-muted/30 px-4 py-3 text-sm prose prose-sm dark:prose-invert max-w-none transition-colors",
                item.isNew
                  ? "border-primary/30 bg-primary/5"
                  : "group-hover:bg-muted/50",
              ].join(" ")}
              dangerouslySetInnerHTML={{ __html: item.rawContent }}
            />
          )}
          {item.type === "field-change" && item.rawContent && (
            <div className="rounded-lg border bg-muted/20 px-3 py-2">
              <CollapsibleContent content={item.rawContent} maxHeight={180} />
            </div>
          )}
          {item.type === "state-transition" && item.content}
        </div>
      </div>
    </div>
  );
};

const StateTransitionContent: React.FC<{
  transition: TransitionItemDTO;
  t: any;
}> = ({ transition, t }) => {
  const statusInfo =
    STATE_TRANSITION_ICONS[transition.status] ||
    STATE_TRANSITION_ICONS.Completed;
  const badgeClass =
    STATE_TRANSITION_BADGES[transition.status] ||
    STATE_TRANSITION_BADGES.Completed;
  const hasStatus = ["Completed", "Overdue", "Escalated"].includes(
    transition.status,
  );

  const fromState = transition.fromState ? transition.fromState.trim() : "";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sm text-foreground">
          {transition.eventName}
        </span>
        {hasStatus && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${badgeClass}`}
          >
            {statusInfo}
            {transition.status}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {fromState ? (
          <>
            <Badge
              variant="outline"
              className="text-xs px-1.5 py-0 h-5 font-normal"
            >
              {fromState}
            </Badge>
            <span className="text-muted-foreground/60 mx-0.5">→</span>
          </>
        ) : null}
        <Badge
          variant="secondary"
          className="text-xs px-1.5 py-0 h-5 font-medium"
        >
          {transition.toState}
        </Badge>
      </div>

      {transition.slaDueDate && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{t.teams?.tickets?.timeline?.("sla_due") || "SLA 到期"}:</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-pointer text-red-500 dark:text-red-400 font-medium hover:underline underline-offset-2">
                {formatDateTime(new Date(transition.slaDueDate))}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t.teams?.tickets?.timeline?.("sla_deadline") || "SLA 截止时间"}:{" "}
              {formatDateTime(new Date(transition.slaDueDate))}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
};

export default UnifiedActivityTimeline;
