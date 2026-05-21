import 'package:go_router/go_router.dart';

import '../../features/auth/login_screen.dart';
import '../../features/customer/customer_home_screen.dart';
import '../../features/jobs/job_status_screen.dart';
import '../../features/jobs/start_job_screen.dart';
import '../../features/sally_chat/sally_chat_screen.dart';
import '../../features/tradie/tradie_home_screen.dart';
import '../../features/trust_passport/tradie_trust_passport_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const CustomerHomeScreen()),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(path: '/start-job', builder: (context, state) => const StartJobScreen()),
    GoRoute(path: '/sally', builder: (context, state) => const SallyChatScreen()),
    GoRoute(
      path: '/job/:jobId',
      builder: (context, state) => JobStatusScreen(jobId: state.pathParameters['jobId'] ?? ''),
    ),
    GoRoute(path: '/tradie', builder: (context, state) => const TradieHomeScreen()),
    GoRoute(
      path: '/tradie/:tradieId/trust',
      builder: (context, state) => TradieTrustPassportScreen(
        tradieId: state.pathParameters['tradieId'] ?? '',
      ),
    ),
  ],
);
