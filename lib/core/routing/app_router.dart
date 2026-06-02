import 'package:go_router/go_router.dart';

import '../session/app_session.dart';
import '../../features/auth/login_screen.dart';
import '../../features/customer/customer_home_screen.dart';
import '../../features/jobs/job_status_screen.dart';
import '../../features/jobs/start_job_screen.dart';
import '../../features/pm/pm_dashboard_screen.dart';
import '../../features/quotes/quote_list_screen.dart';
import '../../features/sally_chat/sally_chat_screen.dart';
import '../../features/tradie/tradie_home_screen.dart';
import '../../features/tradie/tradie_quote_submit_screen.dart';
import '../../features/trust_passport/tradie_trust_passport_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/login',
  refreshListenable: appSession,
  redirect: (context, state) {
    final path = state.uri.path;
    final isLogin = path == '/login';
    final isPublicTrackingLink = path == '/job-status';

    if (!appSession.isSignedIn && !isLogin && !isPublicTrackingLink) {
      return '/login';
    }
    if (appSession.isSignedIn && isLogin) return '/';
    return null;
  },
  routes: [
    GoRoute(path: '/', builder: (context, state) => const CustomerHomeScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(
        path: '/start-job',
        builder: (context, state) => const StartJobScreen()),
    GoRoute(
        path: '/sally', builder: (context, state) => const SallyChatScreen()),
    GoRoute(
        path: '/pm', builder: (context, state) => const PMDashboardScreen()),
    GoRoute(
      path: '/job/:jobId',
      builder: (context, state) =>
          JobStatusScreen(jobId: state.pathParameters['jobId'] ?? ''),
    ),
    GoRoute(
      path: '/job/:jobId/quotes',
      builder: (context, state) =>
          QuoteListScreen(jobId: state.pathParameters['jobId'] ?? ''),
    ),
    GoRoute(
      path: '/job-status',
      builder: (context, state) {
        final query = state.uri.queryParameters;
        final referenceKey = query.containsKey('work_order_id')
            ? 'work_order_id'
            : query.containsKey('job_id')
                ? 'job_id'
                : query.containsKey('lead_id')
                    ? 'lead_id'
                    : query.containsKey('payment_request_id')
                        ? 'payment_request_id'
                        : 'work_order_id';
        return JobStatusScreen(
          jobId: query[referenceKey] ?? '',
          referenceKey: referenceKey,
        );
      },
    ),
    GoRoute(
        path: '/tradie', builder: (context, state) => const TradieHomeScreen()),
    GoRoute(
      path: '/tradie/jobs/:jobId/quote',
      builder: (context, state) =>
          TradieQuoteSubmitScreen(jobId: state.pathParameters['jobId'] ?? ''),
    ),
    GoRoute(
      path: '/tradie/:tradieId/trust',
      builder: (context, state) => TradieTrustPassportScreen(
        tradieId: state.pathParameters['tradieId'] ?? '',
      ),
    ),
  ],
);
